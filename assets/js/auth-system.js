// Auth System for Campaign Counter
class AuthSystem {
  constructor() {
    this.currentUser = null;
    this.sessionTimeout = 30 * 60 * 1000; // 30 menit
    this.idleTimeout = 15 * 60 * 1000; // 15 menit idle
    this.users = [];
    this.init();
  }

  // Initialize users database (in real app, this would connect to backend)
  init() {
    // Check existing session
    const savedSession = localStorage.getItem('auth_session');
    if (savedSession) {
      try {
        const session = JSON.parse(savedSession);
        if (this.isValidSession(session)) {
          this.currentUser = session.user;
          this.setupSessionTimer();
          this.updateUI();
          return;
        }
      } catch (e) {
        console.error('Invalid session:', e);
      }
    }

    const savedUsers = localStorage.getItem('users');
    this.users = savedUsers ? JSON.parse(savedUsers) : [];

    this.updateUI();
    this.setupEventListeners();
  }

  // Save user to database
  saveUser(userData) {
    this.users.push(userData);
    localStorage.setItem('users', JSON.stringify(this.users));
  }

  // Find user by username
  findUser(username) {
    return this.users.find(user => user.username === username);
  }

  // Validate user credentials
  validateUser(username, password) {
    const user = this.findUser(username);
    return user && user.password === password;
  }

  // Login user
  login(username, password) {
    if (this.validateUser(username, password)) {
      const user = this.findUser(username);
      const session = {
        user: {
          username,
          role: user.role,
          level: user.level || 1
        },
        token: this.generateToken(),
        expires: Date.now() + this.sessionTimeout
      };
      localStorage.setItem('auth_session', JSON.stringify(session));
      this.currentUser = user;
      this.setupSessionTimer();
      this.updateUI();
      this.showNotification(`Login successful! Welcome ${this.currentUser.role}`, 'success');
      return true;
    }
    return false;
  }

  logout() {
    localStorage.removeItem('auth_session');
    this.currentUser = null;
    this.clearTimers();
    this.updateUI();
    this.showNotification('Logged out successfully', 'info');
  }

  generateToken() {
    return btoa(Math.random().toString(36) + Date.now().toString(36));
  }

  isValidSession(session) {
    return session.expires > Date.now() && session.token;
  }

  setupSessionTimer() {
    this.clearTimers();
    
    // Session timeout
    this.sessionTimer = setTimeout(() => {
      this.logout();
      this.showNotification('Session expired, please login again', 'warning');
    }, this.sessionTimeout);

    // Idle timeout
    this.resetIdleTimer();
  }

  resetIdleTimer() {
    clearTimeout(this.idleTimer);
    this.idleTimer = setTimeout(() => {
      this.showNotification('Session will expire soon due to inactivity', 'warning');
    }, this.idleTimeout);
  }

  clearTimers() {
    clearTimeout(this.sessionTimer);
    clearTimeout(this.idleTimer);
  }

  setupEventListeners() {
    // Reset idle timer on user activity
    ['mousedown', 'mousemove', 'keypress', 'scroll', 'touchstart'].forEach(event => {
      document.addEventListener(event, () => this.resetIdleTimer(), true);
    });
  }

  updateUI() {
    const profileText = document.getElementById('profile-text');
    const profileName = document.getElementById('profile-name');
    const profileRole = document.getElementById('profile-role');
    const loginAction = document.getElementById('login-action');
    const logoutAction = document.getElementById('logout-action');
    const settingsAction = document.getElementById('settings-action');

    if (this.currentUser) {
      // User logged in
      if (profileText) profileText.textContent = this.currentUser.username;
      if (profileName) profileName.textContent = this.currentUser.username;
      if (profileRole) {
        const roleText = this.currentUser.level === 2 ? 'Administrator' : 'User';
        profileRole.textContent = roleText;
      }
      if (loginAction) loginAction.style.display = 'none';
      if (logoutAction) logoutAction.style.display = 'block';
      if (settingsAction) settingsAction.style.display = 'block';

      // Enable buttons based on role
      this.updateButtonStates();
    } else {
      // Guest mode (not logged in)
      if (profileText) profileText.textContent = 'Guest';
      if (profileName) profileName.textContent = 'Guest User';
      if (profileRole) profileRole.textContent = 'View Only';
      if (loginAction) loginAction.style.display = 'block';
      if (logoutAction) logoutAction.style.display = 'none';
      if (settingsAction) settingsAction.style.display = 'none';

      // Disable all action buttons for guest
      this.disableAllButtons();
    }
  }

  updateButtonStates() {
    const addBtn = document.getElementById('add-btn');
    const decrementBtn = document.getElementById('decrement-btn');
    const editBtn = document.querySelector('.edit-icon');

    if (!this.currentUser) {
      this.disableAllButtons();
      return;
    }

    const level = this.currentUser.level;
    
    // Level 1 (User) - can generate and revert
    if (level === 1) {
      if (addBtn) {
        addBtn.disabled = false;
        addBtn.style.opacity = '1';
        addBtn.style.cursor = 'pointer';
      }
      if (decrementBtn) {
        decrementBtn.disabled = false;
        decrementBtn.style.opacity = '1';
        decrementBtn.style.cursor = 'pointer';
      }
      if (editBtn) {
        editBtn.style.display = 'none'; // User cannot edit
      }
    }

    // Level 2 (Admin) - full access
    if (level === 2) {
      if (addBtn) {
        addBtn.disabled = false;
        addBtn.style.opacity = '1';
        addBtn.style.cursor = 'pointer';
      }
      if (decrementBtn) {
        decrementBtn.disabled = false;
        decrementBtn.style.opacity = '1';
        decrementBtn.style.cursor = 'pointer';
      }
      if (editBtn) {
        editBtn.style.display = 'inline-block';
        editBtn.style.opacity = '1';
        editBtn.style.cursor = 'pointer';
      }
    }
  }

  disableAllButtons() {
    const addBtn = document.getElementById('add-btn');
    const decrementBtn = document.getElementById('decrement-btn');
    const editBtn = document.querySelector('.edit-icon');

    if (addBtn) {
      addBtn.disabled = true;
      addBtn.style.opacity = '0.5';
      addBtn.style.cursor = 'not-allowed';
    }
    if (decrementBtn) {
      decrementBtn.disabled = true;
      decrementBtn.style.opacity = '0.5';
      decrementBtn.style.cursor = 'not-allowed';
    }
    if (editBtn) {
      editBtn.style.display = 'none';
    }
  }

  showNotification(message, type = 'info') {
    // Create toast notification element
    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    toast.textContent = message;
    
    // Add to page
    document.body.appendChild(toast);
    
    // Force reflow
    toast.offsetHeight;
    
    // Auto remove after 8 seconds with longer hide animation
    setTimeout(() => {
      toast.classList.add('toast-hide');
      setTimeout(() => {
        if (document.body.contains(toast)) {
          document.body.removeChild(toast);
        }
      }, 1000); // Longer hide animation
    }, 8000); // Longer display time
  }

  getCurrentUser() {
    return this.currentUser;
  }

  hasPermission(action) {
    if (!this.currentUser) {
      // Guest permissions
      return action === 'view';
    }
    
    const level = this.currentUser.level;
    
    // Level 1 (User) permissions
    if (level === 1) {
      const userPermissions = ['view', 'generate', 'edit', 'settings']; // Add settings permission for users
      return userPermissions.includes(action);
    }
    
    // Level 2 (Admin) permissions - full access
    if (level === 2) {
      const adminPermissions = ['view', 'generate', 'edit', 'reset', 'admin', 'settings'];
      return adminPermissions.includes(action);
    }
    
    return false;
  }

  // Check settings access
  checkSettingsAccess() {
    if (!this.currentUser) {
      this.showNotification('Anda harus login untuk mengakses pengaturan', 'warning');
      return false;
    }
    return true;
  }
}

// Global auth instance
const auth = new AuthSystem();

// Supabase Edge Functions
const supabaseUrl = 'https://your-project-ref.supabase.co'; // Replace with your Supabase URL
const supabaseKey = 'your-anon-key'; // Replace with your Supabase anon key

// Check if user has access to campaign
async function checkUserAccess(userId, campaignId) {
  try {
    const { data, error } = await supabase.rpc(supabaseUrl, supabaseKey, {
      method: 'check_user_access',
      params: {
        user_id: userId,
        campaign_id: campaignId
      }
    });

    if (error) {
      console.error('Error checking user access:', error);
      return false;
    }

    return data.has_access;
  } catch (error) {
    console.error('Error checking user access:', error);
    return false;
  }
}

// Generate UUID for new records
function generateUUID() {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, 'uuid');
}

// Initialize auth system
document.addEventListener('DOMContentLoaded', () => {
  window.auth = new AuthSystem();
});
