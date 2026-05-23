# users.py defines the User model for the Rental Management System. It includes fields for user information, relationships to other models, and is used to store and manage user data in the database. The User model allows us to represent different types of users in the system, such as landlords, tenants, admins, and property managers, and manage their interactions with properties, leases, payments, documents, and notifications.
# The model includes fields for email, username, first name, last name, phone number, hashed password, role, verification status, superuser status, last login time, profile picture, and user preferences for notifications, language, and timezone. The relationships defined in the model allow us to easily access related data for a user, such as their properties, tenants, payments, documents, and notifications.
from sqlalchemy import Column, Integer, String, Boolean, DateTime, Enum
from sqlalchemy.orm import relationship
from app.models.base import BaseModel
import enum

# User role enumeration
# enum refers to a set of symbolic names (members) bound to unique, constant values. In this case, we define an enumeration for user roles in the Rental Management System, which helps to standardize role values and makes it easier to manage user permissions and access control in the application.
# enum is used to define a set of named values that represent the different roles a user can have in the system. This allows us to easily check a user's role and implement role-based access control throughout the application.  
# By using an enum for user roles, we can ensure that only valid roles are assigned to users and simplify the logic for handling different user types in our codebase.
# The UserRole enum defines the possible roles a user can have in the system, such as landlord, tenant, admin, and property manager. This helps to standardize role values and makes it easier to manage user permissions and access control in the application.
class UserRole(str, enum.Enum):
    LANDLORD = "landlord"
    TENANT = "tenant"
    ADMIN = "admin"
    PROPERTY_MANAGER = "property_manager"

class User(BaseModel):
    __tablename__ = 'users'
    
    email = Column(String(255), unique=True, index=True, nullable=False)
    username = Column(String(100), unique=True, index=True, nullable=True)
    first_name = Column(String(100))
    last_name = Column(String(100))
    phone = Column(String(20))
    hashed_password = Column(String(255), nullable=False)
    role = Column(Enum(UserRole), default=UserRole.TENANT)
    is_verified = Column(Boolean, default=False)
    is_superuser = Column(Boolean, default=False)
    last_login = Column(DateTime(timezone=True))
    profile_picture = Column(String(500))
    
    # Preferences
    # The following fields are added to the User model to allow users to set their preferences for receiving notifications, as well as their preferred language and timezone. This enhances the user experience by allowing users to customize how they receive updates and interact with the application based on their individual preferences.
    notification_email = Column(Boolean, default=True)
    notification_sms = Column(Boolean, default=False)
    language = Column(String(10), default='en')
    timezone = Column(String(50), default='UTC')
    
    # Relationships
    # The relationships defined here allow us to easily access related data for a user, such as the properties they own, the tenants they are associated with, their payments, documents they have uploaded, and their notifications. This makes it easier to manage user information and perform operations that involve related data.
    # For example, we can easily retrieve all properties owned by a landlord, all tenants associated with a user, all payments made by a tenant, all documents uploaded by a user, and all notifications for a user. This structure helps to maintain the integrity of the data and simplifies the logic for handling user-related operations in the application.
    properties = relationship("Property", back_populates="owner")
    tenants = relationship("Tenant", back_populates="user")
    payments = relationship("Payment", back_populates="user")
    documents = relationship("Document", back_populates="uploaded_by")
    notifications = relationship("Notification", back_populates="user", cascade="all, delete-orphan")
    sent_messages = relationship("Message", foreign_keys="Message.sender_id", back_populates="sender", cascade="all, delete-orphan")
    received_messages = relationship("Message", foreign_keys="Message.recipient_id", back_populates="recipient", cascade="all, delete-orphan")