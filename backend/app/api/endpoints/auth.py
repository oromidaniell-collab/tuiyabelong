from fastapi import APIRouter, Depends, HTTPException, status, Response
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
    
    # Fixed access tokens for single-owner admin/landlord portals
    if token == "admin-local-2026":
        result = await db.execute(select(User).filter(User.role == UserRole.ADMIN))
        user = result.scalars().first()
        if user: return user
        return User(id=999, email="admin@rms.local", role=UserRole.ADMIN, first_name="Admin", last_name="Local")
        
    if token == "landlord-local-2026":
        result = await db.execute(select(User).filter(User.role == UserRole.LANDLORD))
        user = result.scalars().first()
        if user: return user
        return User(id=998, email="landlord@rms.local", role=UserRole.LANDLORD, first_name="Landlord", last_name="Local")

    try:
        payload = jwt.decode(token, settings.SECRET_KEY, algorithms=[settings.ALGORITHM])
        email: str = payload.get("sub")
        if email is None:
            raise credentials_exception
    except JWTError:
        raise credentials_exception
    result = await db.execute(select(User).filter(User.email == email))
    user = result.scalars().first()
    if user is None:
        raise credentials_exception
    return user

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

# Simple in-memory rate limiter for demo
from collections import defaultdict
import time

login_attempts = defaultdict(list)
register_attempts = defaultdict(list)

def check_rate_limit(key, attempts_list, limit, window=3600):
    now = time.time()
    # Remove attempts older than window
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
async def register(response: Response, user_in: UserCreate, db: AsyncSession = Depends(get_db)):
    from app.core.validators import PasswordValidator, EmailValidator, PhoneValidator
    
    if not is_kenyan_ip("dynamic"): # IP would come from request headers
         raise HTTPException(status_code=403, detail="Registration is only allowed from Kenya.")

    if (not check_rate_limit(user_in.email, register_attempts[user_in.email], 10)):
        raise HTTPException(status_code=429, detail="Too many registration attempts. Please try again later.")

    # Validate email format
    if not EmailValidator.validate(user_in.email):
        raise HTTPException(status_code=400, detail="Invalid email format")

    # STRICT DOMAIN WHITELIST
    allowed_domains = ["gmail.com", "outlook.com", "yahoo.com", "hotmail.com", "icloud.com", "rms.com", "rms.local"]
    try:
        domain = user_in.email.split('@')[1].lower()
        if domain not in allowed_domains:
            raise HTTPException(status_code=400, detail=f"Email domain '@{domain}' is not allowed. Please use a valid domain (e.g., @gmail.com).")
    except IndexError:
        raise HTTPException(status_code=400, detail="Invalid email format")

    if not user_in.terms_accepted:
        raise HTTPException(status_code=400, detail="You must accept the terms of service")
    
    # Validate password strength and length
    password_validation = PasswordValidator.validate(user_in.password)
    if not password_validation["valid"]:
        error_msg = " | ".join(password_validation["errors"])
        raise HTTPException(status_code=422, detail=f"Password requirements not met: {error_msg}")
    
    # Validate phone number (Kenya)
    if not PhoneValidator.validate(user_in.phone):
        raise HTTPException(status_code=400, detail="Invalid phone number. Use Kenya format (e.g., 0712345678 or +254712345678)")
    
    logger.info(f"Registering user: {user_in.email}")
    try:
        # Check if user already exists
        logger.debug("Checking if user exists...")
        result = await db.execute(select(User).filter(User.email == user_in.email))
        user = result.scalars().first()
        if user:
            logger.warning(f"Registration attempt for existing user: {user_in.email}")
            raise HTTPException(status_code=409, detail="A user with this email already exists.")
        
        # Normalize phone number
        logger.debug("Normalizing phone...")
        normalized_phone = PhoneValidator.normalize(user_in.phone)
        
        logger.debug("Hashing password and creating user...")
        new_user = User(
            email=user_in.email,
            phone=normalized_phone,
            hashed_password=get_password_hash(user_in.password),
            first_name=user_in.first_name,
            last_name=user_in.last_name,
            role=user_in.role
        )
        db.add(new_user)
        logger.debug("Committing user to DB...")
        await db.commit()
        logger.debug("Refreshing user...")
        await db.refresh(new_user)
        
        # Create corresponding Tenant record so admin/landlord dashboards can see this tenant
        if new_user.role == UserRole.TENANT:
            from app.models.property import Property
            from app.models.unit import Unit
            
            logger.info(f"Creating tenant record for user {new_user.id}...")
            
            # Handle Room Assignment if provided
            unit_id = None
            if user_in.room_number:
                # 1. Get or Create Default Property
                prop_result = await db.execute(select(Property).limit(1))
                default_prop = prop_result.scalars().first()
                if not default_prop:
                    default_prop = Property(
                        name="Main Property",
                        address="Default Address",
                        property_type="apartment"
                    )
                    db.add(default_prop)
                    await db.commit()
                    await db.refresh(default_prop)
                
                # 2. Get or Create Unit
                unit_result = await db.execute(
                    select(Unit).where(
                        Unit.property_id == default_prop.id,
                        Unit.unit_number == user_in.room_number
                    )
                )
                unit = unit_result.scalars().first()
                if not unit:
                    unit = Unit(
                        property_id=default_prop.id,
                        unit_number=user_in.room_number,
                        monthly_rent=user_in.monthly_rent or 0.0,
                        is_occupied=True
                    )
                    db.add(unit)
                    await db.commit()
                    await db.refresh(unit)
                else:
                    # Update rent if provided
                    if user_in.monthly_rent:
                        unit.monthly_rent = user_in.monthly_rent
                    unit.is_occupied = True
                    await db.commit()
                
                unit_id = unit.id

            new_tenant = Tenant(
                user_id=new_user.id,
                first_name=new_user.first_name,
                last_name=new_user.last_name,
                email=new_user.email,
                phone=new_user.phone,
                unit_id=unit_id,
                status='active'
            )
            db.add(new_tenant)
            await db.commit()
            logger.info("Tenant record created successfully.")
        
        access_token_expires = timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES)
        access_token = create_access_token(
            data={"sub": new_user.email}, expires_delta=access_token_expires
        )
        
        logger.info(f"Registration successful for: {new_user.email}")
        return {"access_token": access_token, "token_type": "bearer"}
    except Exception as e:
        import traceback
        error_trace = traceback.format_exc()
        logger.error(f"Registration failed: {str(e)}")
        logger.error(error_trace)
        raise HTTPException(status_code=500, detail=f"Registration failed: {str(e)}")

@router.post("/login", response_model=Token)
async def login(response: Response, form_data: OAuth2PasswordRequestForm = Depends(), db: AsyncSession = Depends(get_db)):
    if not check_rate_limit(form_data.username, login_attempts[form_data.username], 20):
        raise HTTPException(status_code=429, detail="Too many login attempts. Account temporarily locked.")

    user = await authenticate_user(db, form_data.username, form_data.password)
    if not user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect email or password",
            headers={"WWW-Authenticate": "Bearer"},
        )
    access_token_expires = timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES)
    access_token = create_access_token(
        data={"sub": user.email}, expires_delta=access_token_expires
    )
    
    # Set HttpOnly Cookie with secure settings
    response.set_cookie(
        key="access_token", value=f"Bearer {access_token}", 
        httponly=True, max_age=settings.ACCESS_TOKEN_EXPIRE_MINUTES * 60,
        samesite="strict", secure=True
    )
    
    return {"access_token": access_token, "token_type": "bearer"}

@router.get("/me", response_model=UserOut)
async def get_me(current_user: User = Depends(get_current_user)):
    return current_user

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
