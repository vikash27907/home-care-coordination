# Nurse Registration Refactoring - Task List

## Phase 1: Database Schema Updates
- [x] 1.1 Update nurses table schema - remove duplicate fields (full_name, email, phone_number, password)
- [x] 1.2 Keep only user_id as foreign key reference in nurses table

## Phase 2: Server.js - Nurse Signup Logic
- [x] 2.1 Modify createNurseUnderAgent function - Step 1: Insert into USERS table
- [x] 2.2 Modify createNurseUnderAgent function - Step 2: Insert into NURSES table with user_id only
- [x] 2.3 Remove password, email, full_name from nurse object creation
- [x] 2.4 Implement default avatar logic (/images/default-male.png or /images/default-female.png)
- [x] 2.5 Set status='Pending', email_verified=false, generate OTP

## Phase 3: Multer Configuration
- [x] 3.1 Add profile image upload middleware for profile edit (100KB limit)
- [x] 3.2 Disable profile image upload during signup

## Phase 4: Login System Updates
- [x] 4.1 Ensure login only checks USERS table with bcrypt.compare
- [x] 4.2 Add dashboard access check: email_verified=true AND status='Approved'
- [x] 4.3 Ensure admin and agent auth still work correctly

## Phase 5: Email Integration
- [x] 5.1 Update sendVerificationEmail to support OTP mode
- [x] 5.2 Ensure OTP email is sent after nurse signup

## Phase 6: Cleanup and Verification
- [x] 6.1 Remove any direct password checks against nurses table
- [x] 6.2 Update any joins/queries to use users table for nurse auth data
- [x] 6.3 Test the complete flow
