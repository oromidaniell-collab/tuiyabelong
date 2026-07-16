# Improved the notification endpoint to allow users to create notifications, and added a notification type field to categorize notifications. This enhancement allows for better organization and filtering of notifications based on their type, such as general updates, payment reminders, or maintenance alerts. Users can now specify the type of notification they are creating, which can help them manage and prioritize their notifications more effectively. Additionally, the endpoint now supports creating notifications with a specified type, making it easier for users to generate relevant notifications for themselves or others in the system.
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, update
from app.core.database import get_db
from app.models.users import User, UserRole
from app.models.notification import Notification
from app.api.endpoints.auth import get_current_user
from pydantic import BaseModel
from datetime import datetime
from typing import List

router = APIRouter()

class NotificationResponse(BaseModel):
    id: int
    title: str
    message: str
    is_read: bool
    created_at: datetime
    notification_type: str = None

    class Config:
        from_attributes = True

    @classmethod
    def from_orm_model(cls, n):
        return cls(
            id=n.id,
            title=n.title,
            message=n.message,
            is_read=n.is_read,
            created_at=n.created_at,
            notification_type=n.type
        )

class NotificationCreate(BaseModel):
    title: str
    message: str
    notification_type: str = "general"
    target_user_id: int = None
    broadcast: bool = False

@router.get("/", response_model=List[NotificationResponse])
async def get_notifications(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
    limit: int = 50
):
    """Get user's notifications"""
    result = await db.execute(
        select(Notification)
        .where(Notification.user_id == current_user.id)
        .order_by(Notification.created_at.desc())
        .limit(limit)
    )
    notifications = result.scalars().all()
    return [NotificationResponse.from_orm_model(n) for n in notifications]

# The create_notification endpoint allows users to create new notifications with a specified title, message, and type. This endpoint is designed for admin or landlord users who want to send notifications to themselves or other users in the system. By providing a notification type, users can categorize their notifications, making it easier to manage and filter them later on. The endpoint validates the input data and saves the new notification to the database, ensuring that it is properly associated with the user who created it. This enhancement improves the functionality of the notification system and allows for better communication within the application.
# The mark_as_read endpoint allows users to mark a specific notification as read. This is useful for managing notifications and keeping track of which ones have been acknowledged by the user. By marking a notification as read, users can easily distinguish between new and old notifications, helping them stay organized and focused on important updates. This endpoint ensures that only the owner of the notification can mark it as read, maintaining the integrity of the notification system and preventing unauthorized access to other users' notifications.
# Overall, these enhancements to the notification endpoints provide users with more control over their notifications, allowing them to create and manage their notifications more effectively. By categorizing notifications and providing a way to mark them as read, users can stay informed and organized within the application.
@router.post("/", status_code=status.HTTP_201_CREATED)
async def create_notification(
    notification_in: NotificationCreate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Create a notification (admin/landlord only for broadcast or targeting others)"""
    # Only admin/landlord can broadcast or create notifications for other users
    if notification_in.broadcast or notification_in.target_user_id:
        if current_user.role not in (UserRole.ADMIN, UserRole.LANDLORD):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Only admin or landlord can broadcast notifications or send to specific users"
            )

    # If broadcast, create for all users (or tenants)
    if notification_in.broadcast:
        result = await db.execute(select(User).where(User.role == UserRole.TENANT))
        tenants = result.scalars().all()
        for t in tenants:
            notif = Notification(
                user_id=t.id,
                title=notification_in.title,
                message=notification_in.message,
                type=notification_in.notification_type
            )
            db.add(notif)
        await db.commit()
        return {"message": f"Broadcasted to {len(tenants)} tenants."}
    
    # Specific user
    target_id = notification_in.target_user_id or current_user.id
    notification = Notification(
        user_id=target_id,
        title=notification_in.title,
        message=notification_in.message,
        type=notification_in.notification_type
    )
    db.add(notification)
    await db.commit()
    await db.refresh(notification)
    return notification

@router.put("/{notification_id}/read")
async def mark_as_read(
    notification_id: int,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Mark a notification as read"""
    await db.execute(
        update(Notification)
        .where(Notification.id == notification_id, Notification.user_id == current_user.id)
        .values(is_read=True)
    )
    await db.commit()
    return {"message": "Notification marked as read"}