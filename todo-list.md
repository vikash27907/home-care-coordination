# Nurse System Update Todo List

## Phase 1: Backend & Configuration
- [ ] Install multer for file uploads
- [ ] Update server.js with multer configuration
- [ ] Create upload directories (/uploads/profile, /uploads/resume)
- [ ] Add new nurse fields (aadharNumber, address, profileImagePath, resumePath, certificatePath)
- [ ] Update SKILLS_OPTIONS with expanded nursing skills

## Phase 2: Navigation & Routes
- [ ] Change Dashboard → Profile in nurse nav (head.ejs)
- [ ] Add /nurse/profile/edit route
- [ ] Update /nurse/dashboard to redirect to /nurse/profile
- [ ] Add POST /nurse/profile/edit route

## Phase 3: Views & UI
- [ ] Update nurse-signup.ejs (remove bio, add file upload)
- [ ] Create nurse-profile-edit.ejs (new edit page)
- [ ] Update nurse/profile.ejs (complete redesign)
- [ ] Add skills dropdown UI with tags
- [ ] Add aadhar/address fields
- [ ] Add resume upload section

## Phase 4: Styling
- [ ] Update CSS for new UI elements
- [ ] Profile card styling
- [ ] Skills tags styling
- [ ] Avatar styling

## Phase 5: Testing
- [ ] Test file upload
- [ ] Test profile update
- [ ] Test navigation changes
