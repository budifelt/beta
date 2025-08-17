
// ---- Extracted scripts from inline <script> blocks ----
let fileHandle;
  let xmlDoc;

  // Removed openFileBtn references as Open XML File button is removed
  const saveFileBtn = document.getElementById('saveFileBtn');
  const editor = document.getElementById('editor');
  const campaignIdInput = document.getElementById('campaignId');
  const updateCampaignIdBtn = document.getElementById('updateCampaignIdBtn');
  const subjectInput = document.getElementById('subject');
  const updateSubjectBtn = document.getElementById('updateSubjectBtn');
  const linkInput = document.getElementById('link');
  const updateLinkBtn = document.getElementById('updateLinkBtn');
  const campaignCountIndicator = document.getElementById('campaignCountIndicator');

  const folderOpenBtn = document.getElementById('folderOpenBtn');
  const fileList = document.getElementById('fileList').querySelector('ul');

  saveFileBtn.addEventListener('click', async () => {
    if (!fileHandle) {
      alert("No file opened yet.");
      return;
    }
    if (!editor.textContent.trim()) {
      alert("Editor is empty, cannot save.");
      return;
    }
    // Disable save button and show saving indicator
    saveFileBtn.disabled = true;
    const originalText = saveFileBtn.textContent;
    saveFileBtn.textContent = 'Saving...';

    // Parse current editor content to xmlDoc before saving, but do NOT call updateEditor to avoid clearing editor
    let parser = new DOMParser();
    let parsedDoc = parser.parseFromString(editor.textContent, "application/xml");
    if (parsedDoc.getElementsByTagName('parsererror').length) {
      alert('Error parsing XML before saving');
      saveFileBtn.disabled = false;
      saveFileBtn.textContent = originalText;
      return;
    }
    xmlDoc = parsedDoc;
    try {
      const writable = await fileHandle.createWritable();
      await writable.write(editor.textContent);
      await writable.close();
      // Change save button color to green when pressed
      saveFileBtn.style.borderColor = 'green';
      saveFileBtn.style.backgroundColor = '#e6ffe6'; // light green background
    } catch (err) {
      alert("Error saving file: " + err.message);
    } finally {
      // Re-enable save button and restore text
      saveFileBtn.disabled = false;
      saveFileBtn.textContent = originalText;
    }
  });

  // Reset save button color to default when any input changes
  campaignIdInput.addEventListener('input', () => {
    saveFileBtn.style.borderColor = '';
    saveFileBtn.style.backgroundColor = '';
  });

  subjectInput.addEventListener('input', () => {
    saveFileBtn.style.borderColor = '';
    saveFileBtn.style.backgroundColor = '';
  });

  linkInput.addEventListener('input', () => {
    saveFileBtn.style.borderColor = '';
    saveFileBtn.style.backgroundColor = '';

    // Check mismatch warning when link input changes
    const campaignId = campaignIdInput.value.trim();
    const linkValue = linkInput.value.trim();
    const mismatchWarning = document.getElementById('mismatchWarning');
    const saveBtn = saveFileBtn;

    // Extract digits after underscore in campaign ID for matching
    let matchDigits = '';
    const underscoreIndex = campaignId.lastIndexOf('_');
    if (underscoreIndex !== -1) {
      const digitsPart = campaignId.substring(underscoreIndex + 1);
      if (digitsPart.length === 4) {
        matchDigits = digitsPart;
        matchDigitsLength = 4;
      } else if (digitsPart.length === 3) {
        matchDigits = digitsPart;
        matchDigitsLength = 3;
      }
    } else {
      // fallback to last 4 digits if no underscore found
      matchDigits = campaignId.slice(-4);
      matchDigitsLength = 4;
    }

    let mismatch = false;
    if (campaignId && linkValue) {
      // Extract last part of URL path for matching
      const urlParts = linkValue.split('/');
      const lastPart = urlParts[urlParts.length - 1] || '';
      // Match digits only at the start of lastPart before dash or other separator, exact match
      let regex;
      if (matchDigitsLength === 4) {
        regex = new RegExp('^' + matchDigits + '(-|\\.|_|$)');
      } else if (matchDigitsLength === 3) {
        regex = new RegExp('^' + matchDigits + '(-|\\.|_|$)');
      } else {
        regex = new RegExp('^' + matchDigits + '(-|\\.|_|$)');
      }
      console.log('Campaign ID:', campaignId);
      console.log('Match Digits:', matchDigits);
      console.log('Last URL Part:', lastPart);
      console.log('Regex:', regex);
      console.log('Regex test result:', regex.test(lastPart));
      if (!regex.test(lastPart)) {
        mismatch = true;
      }
    }

    if (mismatch) {
      campaignIdInput.style.borderColor = 'red';
      linkInput.style.borderColor = 'red';
      mismatchWarning.style.display = 'inline';
      saveBtn.disabled = true;
    } else {
      campaignIdInput.style.borderColor = '';
      linkInput.style.borderColor = '';
      mismatchWarning.style.display = 'none';
      saveBtn.disabled = false;
    }
  });

  function loadXmlFromText(xmlText) {
    let parser = new DOMParser();
    xmlDoc = parser.parseFromString(xmlText, "application/xml");
    if (xmlDoc.getElementsByTagName('parsererror').length) {
      alert('Error parsing XML');
      xmlDoc = null;
      return;
    }
    initializeFields();
    updateEditor();
  }

  function updateCampaignCountIndicator(campaignId) {
    if (!xmlDoc || !campaignId || campaignId.trim() === '') {
      campaignCountIndicator.textContent = "0/7";
      campaignCountIndicator.style.color = "red";
      return;
    }
    campaignId = campaignId.trim();
    let count = 0;
    xmlDoc.querySelectorAll('AudienceModel').forEach(el => {
      if (el.getAttribute('name') === campaignId) count++;
    });
    xmlDoc.querySelectorAll('Campaign').forEach(el => {
      if (el.getAttribute('name') === campaignId) count++;
      if (el.getAttribute('audience') === campaignId) count++;
    });
    xmlDoc.querySelectorAll('Interaction').forEach(el => {
      if (el.getAttribute('name') === campaignId) count++;
      if (el.getAttribute('message') === campaignId) count++;
    });
    xmlDoc.querySelectorAll('MessageContent').forEach(el => {
      if (el.getAttribute('name') === campaignId) count++;
    });
    xmlDoc.querySelectorAll('FilterValue').forEach(el => {
      if (el.getAttribute('value') === campaignId) count++;
    });

    campaignCountIndicator.textContent = count + "/7";
    campaignCountIndicator.style.color = (count === 7) ? "green" : "red";
  }

  function initializeFields() {
    // Get current campaign ID from xmlDoc (first AudienceModel or Campaign name attribute)
    let currentCampaignId = '';
    let audienceModel = xmlDoc.querySelector('AudienceModel');
    if (audienceModel) {
      currentCampaignId = audienceModel.getAttribute('name') || '';
    }
    if (!currentCampaignId) {
      let campaign = xmlDoc.querySelector('Campaign');
      if (campaign) {
        currentCampaignId = campaign.getAttribute('name') || '';
      }
    }
    campaignIdInput.value = currentCampaignId;

    updateCampaignCountIndicator(currentCampaignId);

    let messageContent = xmlDoc.querySelector('MessageContent');
    let subject = messageContent ? messageContent.getAttribute('subject') : '';
    subjectInput.value = subject;

    let messageBody = xmlDoc.querySelector('MessageBody');
    let link = messageBody ? messageBody.getAttribute('content') : '';
    linkInput.value = link;
  }

  campaignIdInput.addEventListener('input', () => {
    updateCampaignCountIndicator(campaignIdInput.value);

    // Validate no spaces in campaign ID input on input event
    if (/\s/.test(campaignIdInput.value)) {
      campaignIdInput.style.borderColor = 'red';
    } else {
      campaignIdInput.style.borderColor = '';
    }

    // Check mismatch warning when campaign ID input changes
    const campaignId = campaignIdInput.value.trim();
    const linkValue = linkInput.value.trim();
    const mismatchWarning = document.getElementById('mismatchWarning');
    const saveBtn = saveFileBtn;
    const linkBox = linkInput;

    // Extract last 4 or 3 digits from campaign ID for matching
    let last4Digits = campaignId.slice(-4);
    let last3Digits = campaignId.slice(-3);

    let mismatch = false;
    if (campaignId && linkValue) {
      if (!(linkValue.includes(last4Digits) || linkValue.includes(last3Digits))) {
        mismatch = true;
      }
    }

    if (mismatch) {
      campaignIdInput.style.borderColor = 'red';
      linkInput.style.borderColor = 'red';
      mismatchWarning.style.display = 'inline';
      saveBtn.disabled = true;
    } else {
      mismatchWarning.style.display = 'none';
      saveBtn.disabled = false;
      campaignIdInput.style.borderColor = '';
      linkBox.style.borderColor = '';
    }
  });

  updateCampaignIdBtn.addEventListener('click', () => {
    if (!xmlDoc) return alert("No XML loaded.");

    // Validate no spaces in campaign ID before updating
    if (/\s/.test(campaignIdInput.value)) {
      campaignIdInput.style.borderColor = 'red';
      alert('Campaign ID must not contain spaces.');
      return;
    }

    // Enable save button by default
    saveFileBtn.disabled = false;

    let audienceModel = xmlDoc.querySelector('AudienceModel');
    if (audienceModel) {
      audienceModel.setAttribute('name', campaignIdInput.value);
    }
    let filterValue = xmlDoc.querySelector('AudienceModel > Filter > FilterValue');
    if (filterValue) {
      filterValue.setAttribute('value', campaignIdInput.value);
    }
    let campaign = xmlDoc.querySelector('Campaign');
    if (campaign) {
      campaign.setAttribute('name', campaignIdInput.value);
      campaign.setAttribute('audience', campaignIdInput.value);
    }
    let interaction = xmlDoc.querySelector('Interaction');
    if (interaction) {
      interaction.setAttribute('name', campaignIdInput.value);
      interaction.setAttribute('message', campaignIdInput.value);
    }
    let messageContent = xmlDoc.querySelector('MessageContent');
    if (messageContent) {
      messageContent.setAttribute('name', campaignIdInput.value);
    }
    updateEditor();
    originalXmlContent = editor.value;

    // Update campaign ID character count display
    const campaignIdCharCountSpan = document.getElementById('campaignIdCharCount');
    if (campaignIdCharCountSpan) {
      campaignIdCharCountSpan.textContent = `(${campaignIdInput.value.length})`;
    }

    // Show checkmark icon next to campaignId input
    const checkmark = document.getElementById('campaignIdCheckmark');
    if (checkmark) {
      checkmark.style.display = 'inline';
    }

    // Remove mismatch warning and reset styles when campaign ID is updated
    const mismatchWarning = document.getElementById('mismatchWarning');
    const linkBox = linkInput;
    mismatchWarning.style.display = 'none';
    campaignIdInput.style.borderColor = '';
    linkBox.style.borderColor = '';
  });


  // Reset checkmark icon when campaign ID input changes
  campaignIdInput.addEventListener('input', () => {
    // updateCampaignIdBtn.style.backgroundColor = '';
    const checkmark = document.getElementById('campaignIdCheckmark');
    if (checkmark) {
      checkmark.style.display = 'none';
    }
  });

  subjectInput.addEventListener('input', () => {
    const checkmark = document.getElementById('subjectCheckmark');
    if (checkmark) {
      checkmark.style.display = 'none';
    }
  });

  linkInput.addEventListener('input', () => {
    const checkmark = document.getElementById('linkCheckmark');
    if (checkmark) {
      checkmark.style.display = 'none';
    }
  });

updateSubjectBtn.addEventListener('click', () => {
  if (!xmlDoc) return alert("No XML loaded.");
  let messageContent = xmlDoc.querySelector('MessageContent');
  if (messageContent) {
    // Replace multiple spaces with a single space before setting attribute
    let trimmedSubject = subjectInput.value.replace(/\s{2,}/g, ' ');

    // Replace inner KRHRED_xx inside <%[ ... ]|%> with KRHRED_Unit_xx to avoid double nesting
    trimmedSubject = trimmedSubject.replace(/<%\[KRHRED_([0-9]{1,2})\]\|%>/gi, (match, p1) => {
      const unitNumber = p1.padStart(2, '0');
      if (match.includes(`KRHRED_Unit_${unitNumber}`)) {
        return match;
      }
      return `<%[KRHRED_Unit_${unitNumber}]|%>`;
    });

    // Replace <krhred_xx> with <%[KRHRED_Unit_xx]|%>
    trimmedSubject = trimmedSubject.replace(/<krhred_([0-9]{1,2})>/gi, (match, p1) => {
      const unitNumber = p1.padStart(2, '0');
      return `<%[KRHRED_Unit_${unitNumber}]|%>`;
    });

    // Replace krhred_xx outside of <%[ ... ]|%> with <%[KRHRED_Unit_xx]|%>
    trimmedSubject = trimmedSubject.replace(/krhred_([0-9]{1,2})/gi, (match, p1) => {
      const unitNumber = p1.padStart(2, '0');
      return `<%[KRHRED_Unit_${unitNumber}]|%>`;
    });

    subjectInput.value = trimmedSubject;

    messageContent.setAttribute('subject', trimmedSubject);

    // Update character count display
    const charCountSpan = document.getElementById('subjectCharCount');
    charCountSpan.textContent = `(${trimmedSubject.length})`;

    // Reset subject input box style and enable save button
    subjectInput.style.borderColor = '';
    saveFileBtn.disabled = false;

    updateEditor();
    originalXmlContent = editor.value;

    // Show checkmark icon next to subject input
    const checkmark = document.getElementById('subjectCheckmark');
    if (checkmark) {
      checkmark.style.display = 'inline';
    }
  }
});



  updateLinkBtn.addEventListener('click', () => {
    if (!xmlDoc) return alert("No XML loaded.");
    let messageBody = xmlDoc.querySelector('MessageBody');
    if (messageBody) {
      // Validate link input to be a valid URL starting with http:// or https://
      let linkValue = linkInput.value.trim();
      const urlPattern = /^(http:\/\/|https:\/\/).+/i;
      if (!urlPattern.test(linkValue)) {
        alert('Please enter a valid link starting with http:// or https://');
        linkInput.style.borderColor = 'red';
        return;
      }
      // Convert https:// to http:// as requested
      if (linkValue.startsWith('https://')) {
        linkValue = 'http://' + linkValue.substring(8);
      }
      messageBody.setAttribute('content', linkValue);
      linkInput.style.borderColor = '';
    }
    updateEditor();
    originalXmlContent = editor.value;
    saveFileBtn.disabled = false;

    // Show checkmark icon next to link input
    const checkmark = document.getElementById('linkCheckmark');
    if (checkmark) {
      checkmark.style.display = 'inline';
    }
  });

  function updateEditor() {
    if (!xmlDoc) return;
    let serializer = new XMLSerializer();
    let updatedXmlStr = serializer.serializeToString(xmlDoc);
    updatedXmlStr = formatXml(updatedXmlStr);
    editor.textContent = updatedXmlStr;
  }

  folderOpenBtn.addEventListener('click', async () => {
    try {
      const dirHandle = await window.showDirectoryPicker();
      currentDirHandle = dirHandle; // Store the directory handle
      fileList.innerHTML = '';

      async function buildTree(dirHandle, parentUl) {
        const entries = [];
        for await (const entry of dirHandle.values()) {
          entries.push(entry);
        }
        // Separate directories and files
        const directories = entries.filter(e => e.kind === 'directory').sort((a, b) => a.name.localeCompare(b.name));
        const files = entries.filter(e => e.kind === 'file').sort((a, b) => a.name.localeCompare(b.name));
        // Append directories first
      for (const entry of directories) {
        const li = document.createElement('li');
        li.classList.add('folder');
        li.style.fontWeight = 'normal';

        // Create arrow span
        const arrowSpan = document.createElement('span');
        arrowSpan.classList.add('arrow');
        li.appendChild(arrowSpan);

        // Create folder icon span
        const folderIconSpan = document.createElement('span');
        folderIconSpan.classList.add('folder-icon');
        li.appendChild(folderIconSpan);

        // Create folder name span
        const folderNameSpan = document.createElement('span');
        folderNameSpan.classList.add('folder-name');
        folderNameSpan.textContent = entry.name;
        folderNameSpan.title = entry.name;
        li.appendChild(folderNameSpan);

        const subUl = document.createElement('ul');
        subUl.style.display = 'none';
        li.appendChild(subUl);

        arrowSpan.addEventListener('click', (e) => {
          e.stopPropagation();
          if (subUl.style.display === 'none') {
            subUl.style.display = 'block';
            li.classList.add('open');
          } else {
            subUl.style.display = 'none';
            li.classList.remove('open');
          }
        });

        folderNameSpan.addEventListener('click', (e) => {
          e.stopPropagation();
          if (subUl.style.display === 'none') {
            subUl.style.display = 'block';
            li.classList.add('open');
          } else {
            subUl.style.display = 'none';
            li.classList.remove('open');
          }
        });

        await buildTree(entry, subUl);
        parentUl.appendChild(li);
      }
        // Append files next
      for (const entry of files) {
        const li = document.createElement('li');
        li.classList.add('file');
        li.title = entry.name;
        // Create file icon span
        const fileIconSpan = document.createElement('span');
        fileIconSpan.classList.add('file-icon');
        fileIconSpan.textContent = "📄";
        li.appendChild(fileIconSpan);
        // Create file name span
        const fileNameSpan = document.createElement('span');
        fileNameSpan.classList.add('file-name');
        fileNameSpan.textContent = entry.name;
        li.appendChild(fileNameSpan);
        li.addEventListener('click', async (e) => {
          e.stopPropagation();
          fileHandle = entry; // Update fileHandle to enable saving changes
          const file = await entry.getFile();
          const text = await file.text();
          editor.value = text;
          loadXmlFromText(text);
          // Reset campaignIdCheckmark, subjectCheckmark, and linkCheckmark when switching files
          const campaignIdCheckmark = document.getElementById('campaignIdCheckmark');
          if (campaignIdCheckmark) {
            campaignIdCheckmark.style.display = 'none';
          }
          const subjectCheckmark = document.getElementById('subjectCheckmark');
          if (subjectCheckmark) {
            subjectCheckmark.style.display = 'none';
          }
          const linkCheckmark = document.getElementById('linkCheckmark');
          if (linkCheckmark) {
            linkCheckmark.style.display = 'none';
          }
          // Reset mismatch warning and input border colors when switching files
          const mismatchWarning = document.getElementById('mismatchWarning');
          if (mismatchWarning) {
            mismatchWarning.style.display = 'none';
          }
          campaignIdInput.style.borderColor = '';
          linkInput.style.borderColor = '';
          // Reset save button style when switching files
          saveFileBtn.style.borderColor = '';
          saveFileBtn.style.backgroundColor = '';
          // Highlight selected file
          const siblings = fileList.querySelectorAll('li');
          siblings.forEach(sib => sib.classList.remove('selected'));
          li.classList.add('selected');
        });
        parentUl.appendChild(li);
      }
      }

      await buildTree(dirHandle, fileList);
      saveState(); // Save state after opening folder
    } catch (err) {
      alert('Error opening folder: ' + err.message);
    }
  });

  function formatXml(xml) {
    let formatted = '';
    let reg = /(>)(<)(\/*)/g;
    xml = xml.replace(reg, '$1\r\n$2$3');
    let pad = 0;
    xml.split('\r\n').forEach((node) => {
      let indent = 0;
      if (node.match(/.+<\/\w[^>]*>$/)) {
        indent = 0;
      } else if (node.match(/^<\/\w/)) {
        if (pad !== 0) {
          pad -= 1;
        }
      } else if (node.match(/^<\w[^>]*[^\/]>.*$/)) {
        indent = 1;
      } else {
        indent = 0;
      }

      let padding = '';
      for (let i = 0; i < pad; i++) {i
        padding += '  ';
      }

      formatted += padding + node + '\r\n';
      pad += indent;
    });
    return formatted.trim();
  }
  // State persistence - simple approach
  let currentDirHandle = null;

  function saveState() {
    const state = {
      campaignId: campaignIdInput.value,
      subject: subjectInput.value,
      link: linkInput.value,
      xmlContent: editor.textContent,
      folderOpened: currentDirHandle !== null,
      fileListHTML: document.getElementById('fileList').innerHTML
    };
    localStorage.setItem('config_state', JSON.stringify(state));
  }

  function loadState() {
    const saved = localStorage.getItem('config_state');
    if (saved) {
      try {
        const state = JSON.parse(saved);
        campaignIdInput.value = state.campaignId || '';
        subjectInput.value = state.subject || '';
        linkInput.value = state.link || '';
        if (state.xmlContent) {
          editor.textContent = state.xmlContent;
          loadXmlFromText(state.xmlContent);
        }
        // Restore file list if it was opened before
        if (state.folderOpened && state.fileListHTML) {
          document.getElementById('fileList').innerHTML = state.fileListHTML;
          // Show message that folder needs to be reopened
          const folderBtn = document.getElementById('folderOpenBtn');
          folderBtn.textContent = 'Reopen Folder';
          folderBtn.style.backgroundColor = '#ff6b6b';
        }
      } catch (e) {
        console.error('Error loading state:', e);
      }
    }
  }

  // Auto-save on input changes
  campaignIdInput.addEventListener('input', saveState);
  subjectInput.addEventListener('input', saveState);
  linkInput.addEventListener('input', saveState);

  // Load state when page loads
  window.addEventListener('load', loadState);

  // Save state before leaving page
  window.addEventListener('beforeunload', saveState);
