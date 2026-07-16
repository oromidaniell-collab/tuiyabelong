from fastapi import APIRouter, Depends, HTTPException, status, Response, Request
from typing import Optional
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from datetime import timedelta
from app.config import settings
from app.core.database import get_db
from fastapi.security import OAuth2PasswordRequestForm, OAuth2PasswordBearer
from jose import JWTError, jwt
from app.core.security import (
    authenticate_user, 
    create_access_token, 
    get_password_hash,
    verify_password
)
from app.models.users import User, UserRole
from app.models.tenant import Tenant
from pydantic import BaseModel, EmailStr
import logging

logger = logging.getLogger(__name__)

oauth2_scheme = OAuth2PasswordBearer(tokenUrl=f"{settings.API_V1_STR}/auth/login")

async def get_current_user(db: AsyncSession = Depends(get_db), token: str = Depends(oauth2_scheme)) -> User:
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Could not validate credentials",
        headers={"WWW-Authenticate": "Bearer"},
    )
    
    # Fixed/legacy portal tokens for single-owner admin/landlord portals
    if token in ("admin-local-2026", "landlord-local-2026"):
        if token == "admin-local-2026":
            result = await db.execute(select(User).filter(User.role == UserRole.ADMIN))
            user = result.scalars().first()
            if user:
                return user
            # Create admin user in DB if not exists
            admin_user = User(
                email="admin@rms.local", role=UserRole.ADMIN,
                first_name="Admin", last_name="Local",
                hashed_password=get_password_hash("admin@2026"), phone="0700000000"
            )
            db.add(admin_user)
            try:
                await db.commit()
                await db.refresh(admin_user)
                return admin_user
            except Exception:
                await db.rollback()
                return admin_user

        if token == "landlord-local-2026":
            result = await db.execute(select(User).filter(User.role == UserRole.LANDLORD))
            user = result.scalars().first()
            if user:
                return user
            landlord_user = User(
                email="landlord@rms.local", role=UserRole.LANDLORD,
                first_name="Landlord", last_name="Local",
                hashed_password=get_password_hash("landlord@2026"), phone="0700000001"
            )
            db.add(landlord_user)
            try:
                await db.commit()
                await db.refresh(landlord_user)
                return landlord_user
            except Exception:
                await db.rollback()
                return landlord_user


    try:
        payload = jwt.decode(token, settings.SECRET_KEY, algorithms=[settings.ALGORITHM])
        email: str = payload.get("sub")
        role_claim = payload.get("role")
        if email is None and role_claim is None:
            raise credentials_exception
    except JWTError:
        raise credentials_exception

    # If DB has bootstrap users, use them.
    if email:
        result = await db.execute(select(User).filter(User.email == email))
        user = result.scalars().first()
        if user is not None:
            return user

    # Portal-login tokens: create DB user if not found, so endpoints work properly
    if role_claim == "admin":
        admin_user = User(
            email="admin@rms.local", role=UserRole.ADMIN,
            first_name="Admin", last_name="Local",
            hashed_password=get_password_hash("admin@2026"), phone="0700000000"
        )
        db.add(admin_user)
        try:
            await db.commit()
            await db.refresh(admin_user)
            return admin_user
        except Exception:
            await db.rollback()
            # Fall back to detached object if DB write fails
            return admin_user
    if role_claim == "landlord":
        landlord_user = User(
            email="landlord@rms.local", role=UserRole.LANDLORD,
            first_name="Landlord", last_name="Local",
            hashed_password=get_password_hash("landlord@2026"), phone="0700000001"
        )
        db.add(landlord_user)
        try:
            await db.commit()
            await db.refresh(landlord_user)
            return landlord_user
        except Exception:
            await db.rollback()
            return landlord_user

    raise credentials_exception

router = APIRouter()

class UserCreate(BaseModel):
    email: EmailStr
    phone: str
    password: str
    first_name: str
    last_name: str = ""
    role: UserRole = UserRole.TENANT
    terms_accepted: bool
    room_number: Optional[str] = None
    monthly_rent: Optional[float] = None

class UserOut(BaseModel):
    id: int
    email: EmailStr
    first_name: str
    last_name: str
    phone: Optional[str] = None
    role: UserRole

    class Config:
        from_attributes = True

class Token(BaseModel):
    access_token: str
    token_type: str

# Robust rate limiter with exponential backoff
from collections import defaultdict
import time
from datetime import datetime, timedelta

class RateLimiter:
    """Rate limiter with exponential backoff and IP tracking"""
    def __init__(self):
        self.attempts = defaultdict(list)
        self.blocked_ips = {}  # IP -> unblock_time
    
    def is_blocked(self, key: str) -> bool:
        """Check if IP/email is currently blocked"""
        if key in self.blocked_ips:
            if time.time() < self.blocked_ips[key]:
                return True
            else:
                del self.blocked_ips[key]
        return False
    
    def check_rate_limit(self, key: str, limit: int, window: int = 3600, backoff_multiplier: int = 2) -> bool:
        """
        Check and enforce rate limit with exponential backoff.
        After reaching limit, blocks for increasing durations.
        """
        now = time.time()
        
        # Remove attempts outside window
        self.attempts[key] = [t for t in self.attempts[key] if now - t < window]
        
        # Check if currently blocked with backoff
        if self.is_blocked(key):
            return False
        
        if len(self.attempts[key]) >= limit:
            # Block exponentially: 5min, 15min, 45min, 2h, etc
            failed_attempts = len(self.attempts[key])
            backoff_minutes = 5 * (backoff_multiplier ** (failed_attempts - limit))
            self.blocked_ips[key] = now + (backoff_minutes * 60)
            return False
        
        self.attempts[key].append(now)
        return True
    
    def reset(self, key: str):
        """Reset attempts for a key (on successful login)"""
        if key in self.attempts:
            del self.attempts[key]
        if key in self.blocked_ips:
            del self.blocked_ips[key]

login_limiter = RateLimiter()
register_limiter = RateLimiter()

def get_client_ip(request) -> str:
    """Extract client IP from request, handling proxies"""
    if "x-forwarded-for" in request.headers:
        return request.headers["x-forwarded-for"].split(",")[0].strip()
    return request.client.host if request.client else "unknown"

def check_rate_limit(key, attempts_list, limit, window=3600):
    """Deprecated: use RateLimiter class instead"""
    now = time.time()
    attempts_list[:] = [t for t in attempts_list if now - t < window]
    if len(attempts_list) >= limit:
        return False
    attempts_list.append(now)
    return True

def is_kenyan_ip(ip: str):
    # Simulated geo-fencing: Real apps use GeoIP databases
    # For demo, allow all but can be toggled
    return True 

@router.post("/register", response_model=Token)
async def register(request: Request, response: Response, user_in: UserCreate, db: AsyncSession = Depends(get_db)):
    from app.core.validators import PasswordValidator, EmailValidator, PhoneValidator

    client_ip = get_client_ip(request)

    if not register_limiter.check_rate_limit(client_ip, limit=10, window=3600):
        raise HTTPException(status_code=429, detail="Too many registration attempts. Please try again in a few minutes.")

    if not is_kenyan_ip("dynamic"):
        raise HTTPException(status_code=403, detail="Registration is only allowed from Kenya.")

    normalized_email = str(user_in.email).strip().lower()
    if not EmailValidator.validate(normalized_email):
        raise HTTPException(status_code=400, detail="Invalid email format")

    if settings.DEPLOYMENT_ENV.lower() != "development":
        allowed_domains = ["gmail.com", "outlook.com", "yahoo.com", "hotmail.com", "icloud.com", "rms.com", "rms.local"]
        try:
            domain = normalized_email.split('@')[1].lower()
            if domain not in allowed_domains:
                raise HTTPException(status_code=400, detail=f"Email domain '@{domain}' is not allowed. Please use a valid domain (e.g., @gmail.com).")
        except IndexError:
            raise HTTPException(status_code=400, detail="Invalid email format")

    if not user_in.terms_accepted:
        raise HTTPException(status_code=400, detail="You must accept the terms of service")

    password_validation = PasswordValidator.validate(user_in.password)
    if not password_validation["valid"]:
        error_msg = " | ".join(password_validation["errors"])
        raise HTTPException(status_code=422, detail=f"Password requirements not met: {error_msg}")

    if not PhoneValidator.validate(user_in.phone):
        raise HTTPException(status_code=400, detail="Invalid phone number. Use Kenya format (e.g., 0712345678 or +254712345678)")

    logger.info(f"Registering user: {normalized_email}")

    result = await db.execute(select(User).filter(User.email == normalized_email))
    user = result.scalars().first()
    if user:
        raise HTTPException(status_code=409, detail="A user with this email address is already registered.")

    normalized_phone = PhoneValidator.normalize(user_in.phone)

    new_user = User(
        email=normalized_email,
        phone=normalized_phone,
        hashed_password=get_password_hash(user_in.password),
        first_name=user_in.first_name,
        last_name=user_in.last_name,
        role=user_in.role
    )
    db.add(new_user)
    try:
        await db.commit()
    except Exception as e:
        await db.rollback()
        logger.error(f"Database error during user creation: {str(e)}")
        raise HTTPException(status_code=400, detail="Account registration failed. This email or phone number might already be in use.")

    await db.refresh(new_user)

    # Create corresponding Tenant record
    if new_user.role == UserRole.TENANT:
        new_tenant = Tenant(
            user_id=new_user.id,
            first_name=new_user.first_name,
            last_name=new_user.last_name,
            email=new_user.email,
            phone=new_user.phone,
            unit_id=None,
            status='active'
        )
        db.add(new_tenant)
        try:
            await db.commit()
        except Exception as e:
            await db.rollback()
            logger.error(f"Integrity error creating tenant: {str(e)}")
            logger.warning(f"Tenant record could not be created for {new_user.email}")

    logger.info("Registration completed successfully.")

    access_token_expires = timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES)
    access_token = create_access_token(
        data={"sub": new_user.email}, expires_delta=access_token_expires
    )

    logger.info(f"Registration successful for: {new_user.email}")
    return {"access_token": access_token, "token_type": "bearer"}

@router.post("/login", response_model=Token)
async def login(request: Request, response: Response, form_data: OAuth2PasswordRequestForm = Depends(), db: AsyncSession = Depends(get_db)):
    client_ip = get_client_ip(request)
    
    # Rate limit by IP: 20 attempts per hour
    if not login_limiter.check_rate_limit(client_ip, limit=20, window=3600):
        raise HTTPException(status_code=429, detail="Too many login attempts. Please try again later.")

    user = await authenticate_user(db, form_data.username, form_data.password)
    if not user:
        # Log failed attempt for security monitoring
        logger.warning(f"Failed login attempt from IP {client_ip} for email {form_data.username}")
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect email or password",
            headers={"WWW-Authenticate": "Bearer"},
        )
    access_token_expires = timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES)
    access_token = create_access_token(
        data={"sub": user.email}, expires_delta=access_token_expires
    )
    
    # Set HttpOnly Cookie with secure settings; allow local development over HTTP
    response.set_cookie(
        key="access_token", value=f"Bearer {access_token}",
        httponly=True, max_age=settings.ACCESS_TOKEN_EXPIRE_MINUTES * 60,
        samesite="strict", secure=settings.DEPLOYMENT_ENV.lower() != "development"
    )
    
    # Reset rate limit on successful login
    login_limiter.reset(client_ip)
    
    return {"access_token": access_token, "token_type": "bearer"}

@router.get("/me", response_model=UserOut)
async def get_me(current_user: User = Depends(get_current_user)):
    return current_user

class PortalLoginRequest(BaseModel):
    access_key: str
    password: str
    portal: str  # "admin" or "landlord"

@router.post("/portal-login", response_model=Token)
async def portal_login(request: Request, req: PortalLoginRequest):
    """
    Secure login for admin and landlord portals.
    Validates access key and password against environment variables.
    Returns JWT token if valid.
    """
    client_ip = get_client_ip(request)
    
    # Rate limit by IP: 20 attempts per hour
    if not login_limiter.check_rate_limit(client_ip, limit=20, window=3600):
        raise HTTPException(status_code=429, detail="Too many login attempts. Please try again later.")
    
    portal = req.portal.lower()
    
    if portal == "admin":
        # Validate admin credentials
        if req.access_key == settings.ADMIN_PORTAL_ACCESS_KEY and req.password == settings.ADMIN_PORTAL_PASSWORD:
            access_token_expires = timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES)
            # Create token with admin role
            access_token = create_access_token(
                data={"sub": "admin@rms.local", "role": "admin"}, 
                expires_delta=access_token_expires
            )
            login_limiter.reset(client_ip)
            return {"access_token": access_token, "token_type": "bearer"}
        else:
            logger.warning(f"Failed admin portal login from IP {client_ip}")
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid access key or password",
            )
    
    elif portal == "landlord":
        # Validate landlord credentials
        if req.access_key == settings.LANDLORD_PORTAL_ACCESS_KEY and req.password == settings.LANDLORD_PORTAL_PASSWORD:
            access_token_expires = timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES)
            # Create token with landlord role
            access_token = create_access_token(
                data={"sub": "landlord@rms.local", "role": "landlord"}, 
                expires_delta=access_token_expires
            )
            login_limiter.reset(client_ip)
            return {"access_token": access_token, "token_type": "bearer"}
        else:
            logger.warning(f"Failed landlord portal login from IP {client_ip}")
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid access key or password",
            )
    
    else:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid portal. Must be 'admin' or 'landlord'",
        )

@router.post("/reset-password")
async def reset_password(email: EmailStr, db: AsyncSession = Depends(get_db)):
    # Placeholder for password reset logic (sending email)
    result = await db.execute(select(User).filter(User.email == email))
    user = result.scalars().first()
    if not user:
        # Don't reveal if user exists for security
        return {"message": "If an account exists for this email, a reset link will be sent."}
    
    # In a real app, generate a token, save it, and send an email
    return {"message": "If an account exists for this email, a reset link will be sent."}

@router.get("/setup-db")
async def setup_db(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """
    Initialize database tables. Protected behind authentication.
    Only admins and landlords can trigger this.
    """
    if current_user.role not in [UserRole.ADMIN, UserRole.LANDLORD]:
        raise HTTPException(status_code=403, detail="Only admins can initialize the database")
    
    try:
        from app.core.database import engine, Base
        # Import all models to ensure they are registered
        from app.models.users import User as UserModel
        from app.models.property import Property
        from app.models.unit import Unit
        from app.models.tenant import Tenant
        from app.models.lease import Lease
        from app.models.payment import Payment
        from app.models.maintenance import MaintenanceRequest
        from app.models.notification import Notification
        from app.models.interaction import Feedback, Review
        from app.models.document import Document
        from app.models.monitoring import SystemMetric, LogEntry
        from app.models.cache import CacheItem
        from app.models.utility import UtilityCharge
        
        async with engine.begin() as conn:
            await conn.run_sync(Base.metadata.create_all)
        
        logger.info(f"Database setup triggered by {current_user.email}")
        return {"status": "success", "message": "Database tables created/verified successfully"}
    except Exception as e:
        logger.error(f"Setup DB error: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Database initialization failed: {str(e)}")
