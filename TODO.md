# Home Care System Upgrade - Task List

## PART 1: Service Schedule Cleanup
- [x] Update SERVICE_SCHEDULE_OPTIONS in server.js (replace with new options)
- [x] Update validation logic to accept only new values
- [x] Update request-care.ejs dropdown

## PART 2: Structured Status System
- [x] Add REQUEST_STATUSES constant to server.js
- [x] Update schema.js to add status column with NOT NULL constraint
- [x] Update /request-care POST to set default status "Requested"
- [x] Add status update capability for admin

## PART 3: Email Notification (Postgres Safe)
- [x] Update src/email.js to add sendRequestConfirmationEmail function
- [x] Update /request-care POST to send email after DB insert
- [x] Use async/await with try/catch, don't block request

## PART 4: Track Page (DB Query Version)
- [x] Update /track-request route to query Postgres directly
- [x] Add status badge display
- [x] Add last_updated timestamp
- [x] Update track-request.ejs to show status

## PART 5: Database Safety
- [x] Run ALTER TABLE for status column if needed
- [x] Ensure parameterized queries throughout

## Additional Updates
- [x] Update request-success.ejs to show status
- [x] Update user-dashboard.ejs to show status
- [x] Test all changes
