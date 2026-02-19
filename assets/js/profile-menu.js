// Profile Menu Toggle Function
function toggleProfileMenu() {
  const menu = document.getElementById('profile-menu');
  const trigger = document.querySelector('.profile-trigger');
  const chevron = trigger.querySelector('.fa-chevron-down');
  
  if (menu.classList.contains('active')) {
    menu.classList.remove('active');
    chevron.style.transform = 'rotate(0deg)';
  } else {
    menu.classList.add('active');
    chevron.style.transform = 'rotate(180deg)';
  }
}

// Close profile menu when clicking outside
document.addEventListener('click', (e) => {
  const dropdown = document.querySelector('.profile-dropdown');
  if (!dropdown.contains(e.target)) {
    const menu = document.getElementById('profile-menu');
    const chevron = dropdown.querySelector('.fa-chevron-down');
    menu.classList.remove('active');
    chevron.style.transform = 'rotate(0deg)';
  }
});

// Close profile menu on escape key
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    const menu = document.getElementById('profile-menu');
    const chevron = document.querySelector('.profile-trigger .fa-chevron-down');
    menu.classList.remove('active');
    chevron.style.transform = 'rotate(0deg)';
  }
});

// Logout Modal Functions
function showLogoutModal() {
  const modal = document.getElementById('logout-modal');
  const menu = document.getElementById('profile-menu');
  const chevron = document.querySelector('.profile-trigger .fa-chevron-down');
  
  // Close profile menu first
  menu.classList.remove('active');
  chevron.style.transform = 'rotate(0deg)';
  
  // Show logout modal
  modal.classList.add('active');
}

function closeLogoutModal() {
  const modal = document.getElementById('logout-modal');
  modal.classList.remove('active');
}

function confirmLogout() {
  // Close modal first
  closeLogoutModal();
  
  // Show success toast immediately
  showSuccessToast('Logout successful!');
  
  // Perform logout after longer delay to ensure toast is visible
  setTimeout(() => {
    if (typeof auth !== 'undefined' && auth.logout) {
      auth.logout();
    } else {
      // Fallback: redirect to login page
      window.location.href = 'login.html';
    }
  }, 4000); // 4 second delay
}

// Toast notification function
function showSuccessToast(message) {
  console.log('showSuccessToast called with message:', message);
  
  const toast = document.getElementById('success-toast');
  const toastMessage = document.getElementById('toast-message');
  
  console.log('Toast element:', toast);
  console.log('Toast message element:', toastMessage);
  
  // Update message
  toastMessage.textContent = message;
  
  // Show toast
  toast.classList.add('show');
  
  console.log('Toast classes after adding show:', toast.classList);
  
  // Hide toast after 3 seconds
  const timeoutId = setTimeout(() => {
    console.log('Auto-hiding toast');
    toast.classList.remove('show');
  }, 3000);
  
  // Store timeout ID to clear it if clicked
  toast.dataset.timeoutId = timeoutId;
}

// Hide toast function
function hideToast() {
  const toast = document.getElementById('success-toast');
  
  // Clear the auto-hide timeout
  if (toast.dataset.timeoutId) {
    clearTimeout(parseInt(toast.dataset.timeoutId));
    delete toast.dataset.timeoutId;
  }
  
  // Hide toast
  toast.classList.remove('show');
}

// Close logout modal on escape key
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    const logoutModal = document.getElementById('logout-modal');
    if (logoutModal.classList.contains('active')) {
      closeLogoutModal();
    }
  }
});

// Close logout modal when clicking overlay
document.addEventListener('click', (e) => {
  const logoutModal = document.getElementById('logout-modal');
  if (e.target === logoutModal) {
    closeLogoutModal();
  }
});

// Make toast clickable to dismiss
document.addEventListener('click', (e) => {
  const toast = document.getElementById('success-toast');
  if (e.target === toast || toast.contains(e.target)) {
    hideToast();
  }
});
