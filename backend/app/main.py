from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from contextlib import asynccontextmanager
import logging

from app.api.endpoints import (
    auth, tenants, properties, payments, 
    maintenance, dashboard, documents, reports,
    notifications, interaction, monitoring, arrears,
    utilities, messages
)
from datetime import datetime
from app.core.database import engine, Base, AsyncSessionLocal
from app.config import settings
from fastapi.responses import FileResponse, RedirectResponse
import os
from app.tasks.scheduler import start_scheduler

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

@asynccontextmanager
async def lifespan(app: FastAPI):
    """
    Handle startup and shutdown events
    """
    is_vercel = os.environ.get("VERCEL")
    
    # Startup
    logger.info(f"Starting up Rental Management System (Vercel: {is_vercel})...")
    
    try:
        if not is_vercel:
            # Import all models to ensure they are registered with Base.metadata
            import app.models.users
            import app.models.property
            import app.models.unit
            import app.models.tenant
            import app.models.lease
            import app.models.payment
            import app.models.notification
            import app.models.maintenance
            import app.models.document
            import app.models.interaction
            import app.models.monitoring
            import app.models.cache
            import app.models.utility
            import app.models.message

            # Create database tables - do NOT do this in request path on Vercel
            logger.info("Non-Vercel environment detected. Initializing database tables...")
            async with engine.begin() as conn:
                await conn.run_sync(Base.metadata.create_all)
            
            # Start background scheduler
            logger.info("Starting background scheduler...")
            scheduler = start_scheduler()
            
            # Schedule DB backup (simulated every hour for demo)
            from app.tasks.backup import run_backup
            from app.tasks.reminders import send_rent_reminders
            scheduler.add_job(run_backup, 'interval', hours=24)
            scheduler.add_job(send_rent_reminders, 'interval', days=1)
            
            app.state.scheduler = scheduler
        else:
            logger.info("Vercel environment detected. Skipping automatic table creation and background scheduler.")
            
        logger.info("Application lifespan startup complete")
    except Exception as e:
        logger.error(f"Error during lifespan startup: {str(e)}", exc_info=True)
    
    yield
    
    # Shutdown
    logger.info("Shutting down...")
    if hasattr(app.state, 'scheduler'):
        app.state.scheduler.shutdown()
    await engine.dispose()
    logger.info("Application shutdown complete")

# Create FastAPI app
app = FastAPI(
    title=settings.PROJECT_NAME,
    version=settings.VERSION,
    description="Rental Management System for Landlords",
    lifespan=lifespan
)

# Configure CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.BACKEND_CORS_ORIGINS,
    allow_origin_regex=r"https://.*\.vercel\.app",
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Add middleware to detect portal type based on port or hostname
@app.middleware("http")
async def detect_portal_type(request, call_next):
    """
    Detect which portal is being accessed based on hostname/port or environment.
    Tenant: Port 8000 (default)
    Landlord: Port 8001
    Admin: Port 8002
    """
    host = request.headers.get("host", "localhost")
    port = host.split(":")[-1] if ":" in host else "80"
    
    # Map port to portal type
    if port == str(settings.LANDLORD_PORT) or settings.DEPLOYMENT_ENV == "landlord":
        request.state.portal = "landlord"
    elif port == str(settings.ADMIN_PORT) or settings.DEPLOYMENT_ENV == "admin":
        request.state.portal = "admin"
    else:
        request.state.portal = "tenant"
    
    response = await call_next(request)
    response.headers["X-Portal-Type"] = request.state.portal
    return response

# Include routers
app.include_router(auth.router, prefix=f"{settings.API_V1_STR}/auth", tags=["Authentication"])
app.include_router(properties.router, prefix=f"{settings.API_V1_STR}/properties", tags=["Properties"])
app.include_router(tenants.router, prefix=f"{settings.API_V1_STR}/tenants", tags=["Tenants"])
app.include_router(payments.router, prefix=f"{settings.API_V1_STR}/payments", tags=["Payments"])
app.include_router(maintenance.router, prefix=f"{settings.API_V1_STR}/maintenance", tags=["Maintenance"])
app.include_router(dashboard.router, prefix=f"{settings.API_V1_STR}/dashboard", tags=["Dashboard"])
app.include_router(reports.router, prefix=f"{settings.API_V1_STR}/reports", tags=["Reports"])
app.include_router(documents.router, prefix=f"{settings.API_V1_STR}/documents", tags=["Documents"])
app.include_router(notifications.router, prefix=f"{settings.API_V1_STR}/notifications", tags=["Notifications"])
app.include_router(interaction.router, prefix=f"{settings.API_V1_STR}/interactions", tags=["Interactions"])
app.include_router(monitoring.router, prefix=f"{settings.API_V1_STR}/monitoring", tags=["Monitoring"])
app.include_router(arrears.router, prefix=f"{settings.API_V1_STR}/arrears", tags=["Arrears"])
app.include_router(utilities.router, prefix=f"{settings.API_V1_STR}/utilities", tags=["Utilities"])
app.include_router(messages.router, prefix=f"{settings.API_V1_STR}/messages", tags=["Messages"])

# Admin Router (New)
from app.api.endpoints import admin, users
app.include_router(admin.router, prefix=f"{settings.API_V1_STR}/admin", tags=["Admin"])
app.include_router(users.router, prefix=f"{settings.API_V1_STR}/users", tags=["Users"])

@app.get(f"{settings.API_V1_STR}/cron/rent-reminders")
async def trigger_reminders():
    """Triggered by Vercel Cron to send daily reminders"""
    from app.tasks.reminders import send_rent_reminders
    await send_rent_reminders()
    return {"status": "reminders_sent", "timestamp": datetime.utcnow().isoformat()}

@app.get("/health")
async def health_check():
    return {
        "status": "healthy",
        "timestamp": datetime.utcnow().isoformat()
    }

@app.get("/api/v1/ping")
async def ping():
    """Simple database-free ping to verify connectivity"""
    logger.debug("Ping endpoint reached")
    return {"status": "pong", "timestamp": datetime.utcnow().isoformat()}


BASE_DIR = os.path.dirname(os.path.abspath(__file__))
potential_paths = [
    os.path.abspath(os.path.join(BASE_DIR, "../../frontend")),
    os.path.abspath(os.path.join(BASE_DIR, "../frontend")),
    os.path.abspath("frontend")
]

FRONTEND_DIR = None
for p in potential_paths:
    if os.path.exists(p) and os.path.isdir(p):
        FRONTEND_DIR = p
        break

if FRONTEND_DIR:
    logger.info(f"Serving static files from {FRONTEND_DIR}")
    app.mount("/static", StaticFiles(directory=FRONTEND_DIR), name="static")
else:
    logger.warning("Frontend directory not found. Static file serving disabled.")


handler = app

@app.get("/admin")
async def serve_admin_login():
    """Serve admin login page"""
    file_path = os.path.join(FRONTEND_DIR, "admin-login.html")
    if os.path.exists(file_path):
        return FileResponse(file_path)
    raise HTTPException(status_code=404, detail="Admin login page not found")

@app.get("/landlord")
async def serve_landlord_login():
    """Serve landlord login page"""
    file_path = os.path.join(FRONTEND_DIR, "landlord-login.html")
    if os.path.exists(file_path):
        return FileResponse(file_path)
    raise HTTPException(status_code=404, detail="Landlord login page not found")

@app.get("/{full_path:path}")
async def serve_frontend(request: Request, full_path: str):
    """Serve frontend files with portal-aware routing"""
    
    # Get the detected portal from middleware
    portal = getattr(request.state, 'portal', 'tenant')
    
    # For root path, serve appropriate login/dashboard based on portal
    if full_path == '' or full_path == '/':
        if portal == 'admin':
            file_path = os.path.join(FRONTEND_DIR, "admin-login.html")
        elif portal == 'landlord':
            file_path = os.path.join(FRONTEND_DIR, "landlord-login.html")
        else:
            file_path = os.path.join(FRONTEND_DIR, "index.html")
        
        if os.path.exists(file_path):
            logger.info(f"Serving {portal} portal: {file_path}")
            return FileResponse(file_path)
    
    # Try to serve requested file
    file_path = os.path.join(FRONTEND_DIR, full_path)
    
    # If it's a file that exists, serve it
    if os.path.isfile(file_path):
        return FileResponse(file_path)
    
    
    index_path = os.path.join(FRONTEND_DIR, "index.html")
    if os.path.exists(index_path):
        return FileResponse(index_path)
    
    raise HTTPException(status_code=404, detail="File not found")

if __name__ == "__main__":
    import uvicorn
    
    port = settings.TENANT_PORT  # Default
    if settings.DEPLOYMENT_ENV == "landlord":
        port = settings.LANDLORD_PORT
    elif settings.DEPLOYMENT_ENV == "admin":
        port = settings.ADMIN_PORT
    
    print(f"\n{'='*60}")
    print(f" Starting RMS on port {port} ({settings.DEPLOYMENT_ENV.upper()} Portal)")
    print(f"{'='*60}\n")
    
    uvicorn.run(app, host="0.0.0.0", port=port)