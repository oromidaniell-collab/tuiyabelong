# This file defines the Notification model for the Rental Management System. It includes fields for notification information, relationships to other models, and is used to store and manage notifications in the database. The Notification model allows us to send various types of notifications to users, such as information updates, warnings, payment reminders, and maintenance alerts.
# The model includes fields for the notification title, message, type, and read status, as well as a relationship to the User model to associate notifications with specific users. This structure enables us to effectively manage and deliver notifications within the application.

from sqlalchemy import Column, Integer, String, Boolean, DateTime, ForeignKey, Text
from sqlalchemy.orm import relationship
from datetime import datetime
from .base import BaseModel

class Notification(BaseModel):
    __tablename__ = 'notifications'
    
    user_id = Column(Integer, ForeignKey('users.id'), nullable=False)
    title = Column(String(255), nullable=False)
    message = Column(Text, nullable=False)
    is_read = Column(Boolean, default=False)
    type = Column(String(50))  # info, warning, payment, maintenance
    
    # Relationships
    user = relationship("User", back_populates="notifications")
