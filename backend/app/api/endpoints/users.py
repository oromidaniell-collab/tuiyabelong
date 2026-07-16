from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, update
from app.api.endpoints.auth import get_current_user
from app.core.database import get_db
from app.models.users import User
from app.models.tenant import Tenant
from pydantic import BaseModel

router = APIRouter()

class PhotoUpload(BaseModel):
    photo_data: str

@router.post("/profile-photo")
async def upload_profile_photo(
    body: PhotoUpload,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Store profile photo as base64 data URL in the database (Vercel-compatible)"""
    photo_data = body.photo_data.strip()
    
    # Validate it's a data URL
    if not photo_data.startswith("data:image"):
        raise HTTPException(status_code=400, detail="Invalid image data format")
    
    # Limit size: base64 string ~133% of binary, so 2MB binary ~2.7MB string
    if len(photo_data) > 3_000_000:
        raise HTTPException(status_code=400, detail="Image too large (max 2MB)")
    
    # Store directly in the database
    await db.execute(
        update(User)
        .where(User.id == current_user.id)
        .values(profile_picture=photo_data)
    )
    await db.commit()
    
    return {"profile_picture": photo_data}

@router.get("/me/photo")
async def get_profile_photo(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Get current user's profile photo data URL"""
    result = await db.execute(
        select(User.profile_picture).where(User.id == current_user.id)
    )
    row = result.scalar_one_or_none()
    return {"profile_picture": row}

@router.delete("/me/photo")
async def delete_profile_photo(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Remove current user's profile photo"""
    await db.execute(
        update(User)
        .where(User.id == current_user.id)
        .values(profile_picture=None)
    )
    await db.commit()
    return {"message": "Profile photo removed"}
