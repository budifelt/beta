
// ---- Extracted scripts from inline <script> blocks ----
// Initialize CodeMirror editor for htmlInput textarea
  const textarea = document.getElementById('htmlInput');
  const editor = CodeMirror.fromTextArea(textarea, {
    mode: 'htmlmixed',
    theme: 'material',
    lineNumbers: true,
    lineWrapping: true,
    autoCloseTags: true,
    matchBrackets: true,
  });

const htmlInput = document.getElementById('htmlInput');
  const checkLayoutBtn = document.getElementById('checkLayoutBtn');
  const statusDiv = document.getElementById('status'); // may be null if not present
  const krhredUnitsContainer = document.getElementById('krhredUnitsContainer');
  const addKrhredBtn = document.getElementById('addKrhredBtn');
  const originalUrlInput = document.getElementById('originalUrlInput');
  const downloadBtn = document.getElementById('downloadBtn');
  const clearAllBtn = document.getElementById('clearAllBtn');

  checkLayoutBtn.addEventListener('click', () => {
    let content = editor.getValue();
    if (!content.trim()) {
      alert('Please paste HTML content first.');
      return;
    }
    // Replace placeholders <%[KRHRED_Unit_XX]|%> with textbox values or keep placeholder if empty
    const inputs = krhredUnitsContainer.querySelectorAll('input[id^="krhred_unit_"]');
    inputs.forEach(input => {
      const num = input.id.replace('krhred_unit_', '');
      const regex = new RegExp(`<%\\[KRHRED_Unit_${num}\\]\\|%>`, 'g');
      if (input.value && input.value.trim() !== '') {
        content = content.replace(regex, input.value);
      }
    });
    // Fix image URLs to absolute URLs if original URL is provided
    const originalUrlValue = document.getElementById('originalUrlInput').value.trim();
    if (originalUrlValue) {
      try {
        const urlObj = new URL(originalUrlValue);
        let basePath = urlObj.origin + urlObj.pathname.substring(0, urlObj.pathname.lastIndexOf('/') + 1);
        content = content.replace(/src="images\//g, `src="${basePath}images/`);
      } catch (e) {
        alert('Invalid original URL provided.');
        return;
      }
    }
    // Save content as a Blob and open in new tab
    const blob = new Blob([content], { type: 'text/html' });
    const url = URL.createObjectURL(blob);
    window.open(url, '_blank');
    if (statusDiv) { statusDiv.textContent = ''; statusDiv.id = ''; }
  });

  addKrhredBtn.addEventListener('click', () => {
    // Find the highest current krhred_unit number
    const inputs = krhredUnitsContainer.querySelectorAll('input[id^="krhred_unit_"]');
    let maxNum = 29;
    inputs.forEach(input => {
      const num = parseInt(input.id.replace('krhred_unit_', ''), 10);
      if (num > maxNum) maxNum = num;
    });
    const newNum = maxNum + 1;

    // Calculate grid position for new input
    const gridColumn = Math.floor((newNum - 30) / 5) + 1;
    const gridRow = ((newNum - 30) % 5) + 1;

    // Create new input
    const div = document.createElement('div');
    div.style.display = 'flex';
    div.style.flexDirection = 'column';
    div.style.alignItems = 'flex-start';
    div.style.gridColumn = gridColumn;
    div.style.gridRow = gridRow;

    const input = document.createElement('input');
    input.type = 'text';
    input.id = `krhred_unit_${newNum}`;
    input.name = `krhred_unit_${newNum}`;
    input.placeholder = `krhred_unit_${newNum}`;
    div.appendChild(input);
    krhredUnitsContainer.appendChild(div);

    // Input color feedback
    input.addEventListener('input', () => {
      const length = input.value.trim().length;
      if (length > 60) {
        input.style.backgroundColor = 'red';
      } else if (length > 0) {
        input.style.backgroundColor = 'lightgreen';
      } else {
        input.style.backgroundColor = '';
      }
      saveState();
    });
  });

  // Input color feedback for existing inputs
  const existingInputs = krhredUnitsContainer.querySelectorAll('input[id^="krhred_unit_"]');
  existingInputs.forEach(input => {
    input.addEventListener('input', () => {
      const length = input.value.trim().length;
      if (length > 60) {
        input.style.backgroundColor = 'red';
      } else if (length > 0) {
        input.style.backgroundColor = 'lightgreen';
      } else {
        input.style.backgroundColor = '';
      }
    });
  });

  // Show/hide download button based on URL input
  originalUrlInput.addEventListener('input', () => {
    if (originalUrlInput.value.trim()) {
      downloadBtn.style.display = 'flex';
    } else {
      downloadBtn.style.display = 'none';
    }
  });

  // Download and auto-paste HTML source code
  downloadBtn.addEventListener('click', async () => {
    const url = originalUrlInput.value.trim();
    if (!url) {
      alert('Please enter a URL first.');
      return;
    }

    try {
      // Show loading state
      downloadBtn.disabled = true;
      downloadBtn.innerHTML = '<svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" style="margin-right: 4px; animation: spin 1s linear infinite;"><path d="M12,4V2A10,10 0 0,0 2,12H4A8,8 0 0,1 12,4Z"/></svg>Loading...';

      // List of CORS proxy servers to try
      const corsProxies = [
        'https://api.allorigins.win/get?url=',
        'https://cors-anywhere.herokuapp.com/',
        'https://thingproxy.freeboard.io/fetch/',
        'https://api.codetabs.com/v1/proxy?quest='
      ];

      let htmlContent = null;

      // Try direct fetch first
      try {
        const response = await fetch(url, {
          mode: 'cors',
          headers: {
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8'
          }
        });
        if (response.ok) {
          htmlContent = await response.text();
        }
      } catch (directError) {
        console.log('Direct fetch failed, trying proxies...');
      }

      // If direct fetch failed, try CORS proxies
      if (!htmlContent) {
        for (const proxy of corsProxies) {
          try {
            let proxyUrl = proxy + encodeURIComponent(url);
            let response = await fetch(proxyUrl);
            if (response.ok) {
              if (proxy.includes('allorigins')) {
                const data = await response.json();
                htmlContent = data.contents;
              } else {
                htmlContent = await response.text();
              }
              break;
            }
          } catch (proxyError) {
            console.log(`Proxy ${proxy} failed:`, proxyError);
            continue;
          }
        }
      }

      if (htmlContent) {
        editor.setValue(htmlContent);
        alert('HTML source code successfully downloaded and pasted!');
      } else {
        throw new Error('All proxy attempts failed');
      }

    } catch (error) {
      console.error('Error fetching HTML:', error);
      try {
        window.open(url, '_blank');
        localStorage.setItem('layoutCheckerURL', url);
        alert('Unable to automatically fetch the HTML due to CORS restrictions. The page has been opened in a new tab.\n\nTo get the source code:\n1. Right-click on the page\n2. Select "View Page Source" or press Ctrl+U\n3. Copy all the HTML code\n4. Paste it into the HTML content editor here');
      } catch (fallbackError) {
        alert('Error: Unable to fetch the HTML content. Please copy the source code manually from the URL and paste it here.');
      }
    } finally {
      downloadBtn.disabled = false;
      downloadBtn.innerHTML = '<svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" style="margin-right: 4px;"><path d="M19 9h-4V3H9v6H5l7 7 7-7zM5 18v2h14v-2H5z"/></svg>Download';
    }
  });

  // Apply krhred values functionality
  const applyKrhredBtn = document.getElementById('applyKrhredBtn');
  const krhredInput = document.getElementById('krhredInput');

  applyKrhredBtn.addEventListener('click', () => {
    const krhredText = krhredInput.value.trim();
    if (!krhredText) {
      alert('Please paste krhred values first.');
      return;
    }

    // Parse krhred values in new format: attr:KRHRED_Unit_XX : <next line value>
    const lines = krhredText.split('\n');
    const krhredValues = {};

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      if (line.startsWith('attr:KRHRED_Unit_')) {
        const key = line.replace('attr:', '').replace(' :', '');
        const value = lines[i + 1] ? lines[i + 1].trim() : '';
        krhredValues[key] = value;
        i++; // skip value line
      }
    }

    // Apply values to corresponding input fields
    Object.keys(krhredValues).forEach(key => {
      const unitNumber = key.replace('KRHRED_Unit_', '');
      const inputField = document.getElementById(`krhred_unit_${unitNumber}`);
      if (inputField) {
        inputField.value = krhredValues[key];
        inputField.dispatchEvent(new Event('input')); // color update
      }
    });

    saveState();
  });

  // Clear All functionality
  clearAllBtn.addEventListener('click', () => {
    if (!confirm('Yakin ingin menghapus semua isi?')) return;

    // Clear all krhred inputs
    document.querySelectorAll('input[id^="krhred_unit_"]').forEach(input => {
      input.value = '';
      input.style.backgroundColor = '';
    });

    // Clear krhred textarea and HTML editor
    document.getElementById('krhredInput').value = '';
    editor.setValue('');

    // Clear URL & hide download button
    document.getElementById('originalUrlInput').value = '';
    document.getElementById('downloadBtn').style.display = 'none';

    // Remove saved state
    localStorage.removeItem('layoutChecker_state');
    localStorage.removeItem('layoutCheckerSource');
    localStorage.removeItem('layoutCheckerURL');
  });

  // Check for stored source when page loads
  window.addEventListener('load', () => {
    const storedSource = localStorage.getItem('layoutCheckerSource');
    const storedURL = localStorage.getItem('layoutCheckerURL');

    if (storedSource) {
      editor.setValue(storedSource);
      if (storedURL) {
        originalUrlInput.value = storedURL;
        downloadBtn.style.display = 'flex';
      }
      localStorage.removeItem('layoutCheckerSource');
      localStorage.removeItem('layoutCheckerURL');
      alert('Source code automatically pasted from previous page!');
    }
  });

  // State persistence - simple approach
  function saveState() {
    const state = {
      htmlContent: editor.getValue(),
      originalUrl: document.getElementById('originalUrlInput').value,
      krhredValues: {}
    };
    const krhredInputs = document.querySelectorAll('input[id^="krhred_unit_"]');
    krhredInputs.forEach(input => {
      state.krhredValues[input.id] = input.value;
    });
    localStorage.setItem('layoutChecker_state', JSON.stringify(state));
  }

  function loadState() {
    const saved = localStorage.getItem('layoutChecker_state');
    if (saved) {
      try {
        const state = JSON.parse(saved);
        if (state.htmlContent) { editor.setValue(state.htmlContent); }
        if (state.originalUrl) {
          document.getElementById('originalUrlInput').value = state.originalUrl;
          document.getElementById('downloadBtn').style.display = 'flex';
        }
        if (state.krhredValues) {
          Object.keys(state.krhredValues).forEach(inputId => {
            const input = document.getElementById(inputId);
            if (input) {
              input.value = state.krhredValues[inputId];
              input.dispatchEvent(new Event('input'));
            }
          });
        }
      } catch (e) {
        console.error('Error loading state:', e);
      }
    }
  }

  // Auto-save on input changes
  editor.on('change', saveState);
  document.getElementById('originalUrlInput').addEventListener('input', saveState);
  document.getElementById('krhredInput').addEventListener('input', saveState);

  // Auto-save for existing krhred inputs
  const existingKrhredInputs = document.querySelectorAll('input[id^="krhred_unit_"]');
  existingKrhredInputs.forEach(input => {
    input.addEventListener('input', saveState);
  });

  // Load state when page loads
  window.addEventListener('load', loadState);

  // Save state before leaving page
  window.addEventListener('beforeunload', saveState);
