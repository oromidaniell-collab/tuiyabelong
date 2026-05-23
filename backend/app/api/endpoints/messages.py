# Messages endpoint for inter-user communication between tenants, landlords, and admins
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, and_, or_, desc
from app.core.database import get_db
from app.models.users import User
from app.models.message import Message
from app.api.endpoints.auth import get_current_user
from pydantic import BaseModel
from datetime import datetime
from typing import List

router = APIRouter()

class MessageResponse(BaseModel):
    id: int
    sender_id: int
    recipient_id: int
    subject: str
    body: str
    is_read: bool
    created_at: datetime
    
    class Config:
        from_attributes = True

class MessageCreate(BaseModel):
    recipient_id: int
    subject: str
    body: str

class MessageThread(BaseModel):
    id: int
    sender_id: int
    recipient_id: int
    sender_name: str
    recipient_name: str
    subject: str
    body: str
    is_read: bool
    created_at: datetime

@router.get("/inbox", response_model=List[MessageResponse])
async def get_inbox(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
    limit: int = 50
):
    """Get user's received messages"""
    result = await db.execute(
        select(Message)
        .where(Message.recipient_id == current_user.id)
        .order_by(Message.created_at.desc())
        .limit(limit)
    )
    messages = result.scalars().all()
    return messages

@router.get("/sent", response_model=List[MessageResponse])
async def get_sent_messages(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
    limit: int = 50
):
    """Get user's sent messages"""
    result = await db.execute(
        select(Message)
        .where(Message.sender_id == current_user.id)
        .order_by(Message.created_at.desc())
        .limit(limit)
    )
    messages = result.scalars().all()
    return messages

@router.post("/", status_code=status.HTTP_201_CREATED, response_model=MessageResponse)
async def send_message(
    msg: MessageCreate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Send a message to another user"""
    
    # Check if recipient exists
    recipient_result = await db.execute(
        select(User).where(User.id == msg.recipient_id)
    )
    recipient = recipient_result.scalars().first()
    if not recipient:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Recipient not found")
    
    # Create and save message
    message = Message(
        sender_id=current_user.id,
        recipient_id=msg.recipient_id,
        subject=msg.subject,
        body=msg.body
    )
    db.add(message)
    await db.commit()
    await db.refresh(message)
    
    return message

@router.get("/{message_id}", response_model=MessageResponse)
async def get_message(
    message_id: int,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Get a specific message and mark as read"""
    result = await db.execute(
        select(Message).where(Message.id == message_id)
    )
    message = result.scalars().first()
    
    if not message:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Message not found")
    
    # Check if current user is sender or recipient
    if message.sender_id != current_user.id and message.recipient_id != current_user.id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Access denied")
    
    # Mark as read if current user is recipient
    if message.recipient_id == current_user.id and not message.is_read:
        message.is_read = True
        await db.commit()
    
    return message

@router.put("/{message_id}/read", status_code=status.HTTP_200_OK)
async def mark_as_read(
    message_id: int,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Mark a message as read"""
    result = await db.execute(
        select(Message).where(Message.id == message_id)
    )
    message = result.scalars().first()
    
    if not message:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Message not found")
    
    if message.recipient_id != current_user.id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Can only mark your own messages as read")
    
    message.is_read = True
    await db.commit()
    
    return {"status": "success", "message": "Message marked as read"}

@router.delete("/{message_id}", status_code=status.HTTP_200_OK)
async def delete_message(
    message_id: int,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Delete a message"""
    result = await db.execute(
        select(Message).where(Message.id == message_id)
    )
    message = result.scalars().first()
    
    if not message:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Message not found")
    
    # Only sender or recipient can delete
    if message.sender_id != current_user.id and message.recipient_id != current_user.id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Access denied")
    
    await db.delete(message)
    await db.commit()
    
    return {"status": "success", "message": "Message deleted"}
