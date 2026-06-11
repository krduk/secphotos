// SecPhotos Core Application Logic

// Application State
let state = {
  clientId: localStorage.getItem('secphotos_client_id') || '',
  folderName: localStorage.getItem('secphotos_folder_name') || 'SecPhotos',
  accessToken: localStorage.getItem('secphotos_access_token') || '',
  tokenExpiry: parseInt(localStorage.getItem('secphotos_token_expiry') || '0', 10),
  folderId: localStorage.getItem('secphotos_folder_id') || '',
  userEmail: localStorage.getItem('secphotos_user_email') || '',
  queueMode: localStorage.getItem('secphotos_queue_mode') === 'true',
  tokenClient: null
};

// Global DB instance
let db = null;

// DOM Elements
const elements = {
  setupView: document.getElementById('setup-view'),
  connectView: document.getElementById('connect-view'),
  captureView: document.getElementById('capture-view'),
  
  clientIdInput: document.getElementById('client-id-input'),
  saveSetupBtn: document.getElementById('save-setup-btn'),
  
  currentClientIdDisplay: document.getElementById('current-client-id-display'),
  connectBtn: document.getElementById('connect-btn'),
  changeClientIdBtn: document.getElementById('change-client-id-btn'),
  
  userEmailDisplay: document.getElementById('user-email'),
  uploadModeDisplay: document.getElementById('upload-mode-display'),
  folderNameDisplay: document.getElementById('folder-name'),
  
  photoCapture: document.getElementById('photo-capture'),
  videoCapture: document.getElementById('video-capture'),
  capturePhotoBtn: document.getElementById('capture-photo-btn'),
  captureVideoBtn: document.getElementById('capture-video-btn'),
  uploadList: document.getElementById('upload-list'),
  
  queueBar: document.getElementById('queue-bar'),
  queueCount: document.getElementById('queue-count'),
  queueSize: document.getElementById('queue-size'),
  uploadQueueBtn: document.getElementById('upload-queue-btn'),
  
  settingsToggleBtn: document.getElementById('settings-toggle-btn'),
  settingsModal: document.getElementById('settings-modal'),
  settingsCloseBtn: document.getElementById('settings-close-btn'),
  settingsClientId: document.getElementById('settings-client-id'),
  settingsFolderName: document.getElementById('settings-folder-name'),
  settingsQueueMode: document.getElementById('settings-queue-mode'),
  settingsSaveBtn: document.getElementById('settings-save-btn'),
  disconnectBtn: document.getElementById('disconnect-btn')
};

// Initialize Application
document.addEventListener('DOMContentLoaded', () => {
  initDB().then(() => {
    initUI();
    setupEventListeners();
    checkGisLoaded();
    updateQueueBar();
  }).catch(err => {
    console.error('Database initialization failed:', err);
    initUI();
    setupEventListeners();
    checkGisLoaded();
  });
});

// Check if GIS library is loaded and initialize Token Client
function checkGisLoaded() {
  if (typeof google !== 'undefined' && google.accounts && google.accounts.oauth2) {
    initTokenClient();
  } else {
    // Retry in 100ms
    setTimeout(checkGisLoaded, 100);
  }
}

// Initialize the Google Identity Services Token Client
function initTokenClient() {
  if (!state.clientId) return;
  
  try {
    state.tokenClient = google.accounts.oauth2.initTokenClient({
      client_id: state.clientId,
      scope: 'https://www.googleapis.com/auth/drive.file https://www.googleapis.com/auth/userinfo.email',
      callback: (tokenResponse) => {
        if (tokenResponse && tokenResponse.access_token) {
          state.accessToken = tokenResponse.access_token;
          state.tokenExpiry = Date.now() + (tokenResponse.expires_in * 1000);
          
          localStorage.setItem('secphotos_access_token', state.accessToken);
          localStorage.setItem('secphotos_token_expiry', state.tokenExpiry);
          
          handleSuccessfulAuthentication();
        }
      },
      error_callback: (err) => {
        console.error('GIS Error:', err);
        alert('Google認証の初期化中にエラーが発生しました: ' + err.message);
      }
    });
    console.log('Google Identity Services initialized.');
  } catch (e) {
    console.error('Failed to initialize token client:', e);
  }
}

// Setup Event Listeners
function setupEventListeners() {
  // Setup view
  elements.saveSetupBtn.addEventListener('click', saveInitialSetup);
  
  // Connection view
  elements.connectBtn.addEventListener('click', connectToGoogle);
  elements.changeClientIdBtn.addEventListener('click', resetClientId);
  
  // Settings Modal
  elements.settingsToggleBtn.addEventListener('click', openSettings);
  elements.settingsCloseBtn.addEventListener('click', closeSettings);
  elements.settingsSaveBtn.addEventListener('click', saveSettings);
  elements.disconnectBtn.addEventListener('click', disconnectGoogle);
  
  // Close modal when clicking outside content
  window.addEventListener('click', (e) => {
    if (e.target === elements.settingsModal) {
      closeSettings();
    }
  });
  
  // Camera capture interactions
  elements.capturePhotoBtn.addEventListener('click', () => {
    elements.photoCapture.click();
  });
  
  elements.captureVideoBtn.addEventListener('click', () => {
    elements.videoCapture.click();
  });
  
  elements.photoCapture.addEventListener('change', handleFileCapture);
  elements.videoCapture.addEventListener('change', handleFileCapture);

  // Queue upload interactions
  elements.uploadQueueBtn.addEventListener('click', uploadAllPending);
}

// Route UI state based on settings and login status
function initUI() {
  // Pre-fill settings
  elements.settingsClientId.value = state.clientId;
  elements.settingsFolderName.value = state.folderName;
  elements.settingsQueueMode.checked = state.queueMode;
  elements.folderNameDisplay.textContent = state.folderName;
  
  if (!state.clientId) {
    showView('setup-view');
  } else if (!state.accessToken || Date.now() >= state.tokenExpiry) {
    elements.currentClientIdDisplay.textContent = state.clientId;
    showView('connect-view');
  } else {
    // We have a token, restore session information
    elements.userEmailDisplay.textContent = state.userEmail || 'サインイン中...';
    showView('capture-view');
    verifyFolderAndStart();
    loadPendingIntoUI();
  }
}

// Utility to switch active views
function showView(viewId) {
  document.querySelectorAll('.view').forEach(view => {
    view.classList.remove('active');
  });
  const activeView = document.getElementById(viewId);
  if (activeView) {
    activeView.classList.add('active');
  }
}

// Initial setup handler
function saveInitialSetup() {
  const clientId = elements.clientIdInput.value.trim();
  if (!clientId) {
    alert('クライアントIDを入力してください。');
    return;
  }
  
  state.clientId = clientId;
  localStorage.setItem('secphotos_client_id', clientId);
  elements.settingsClientId.value = clientId;
  
  initTokenClient();
  initUI();
}

// Trigger Google OAuth sign-in flow
function connectToGoogle() {
  if (!state.tokenClient) {
    initTokenClient();
  }
  
  if (state.tokenClient) {
    // Request access token
    state.tokenClient.requestAccessToken({ prompt: '' });
  } else {
    alert('Google認証クライアントが初期化されていません。数秒待ってから再試行してください。');
  }
}

// Action when authentication succeeds
async function handleSuccessfulAuthentication() {
  showView('capture-view');
  elements.userEmailDisplay.textContent = '取得中...';
  
  try {
    // Fetch user details
    await fetchUserInfo();
    // Verify target folder
    await verifyFolderAndStart();
  } catch (error) {
    console.error('Error post-auth:', error);
  }
}

// Get user profile email
async function fetchUserInfo() {
  try {
    const res = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
      headers: { 'Authorization': `Bearer ${state.accessToken}` }
    });
    
    if (res.status === 401) {
      handleUnauthorized();
      return;
    }
    
    const data = await res.json();
    if (data && data.email) {
      state.userEmail = data.email;
      localStorage.setItem('secphotos_user_email', data.email);
      elements.userEmailDisplay.textContent = data.email;
    }
  } catch (err) {
    console.error('Failed to fetch user info:', err);
    elements.userEmailDisplay.textContent = 'サインイン済';
  }
}

// Ensure the Google Drive Folder exists, otherwise create it
async function verifyFolderAndStart() {
  try {
    elements.folderNameDisplay.textContent = `${state.folderName} (確認中...)`;
    
    // 1. Search for folder name
    const query = `name='${state.folderName}' and mimeType='application/vnd.google-apps.folder' and trashed=false`;
    const res = await fetch(`https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(query)}&fields=files(id,name)`, {
      headers: { 'Authorization': `Bearer ${state.accessToken}` }
    });
    
    if (res.status === 401) {
      handleUnauthorized();
      return;
    }
    
    const data = await res.json();
    
    if (data.files && data.files.length > 0) {
      // Folder exists
      state.folderId = data.files[0].id;
      localStorage.setItem('secphotos_folder_id', state.folderId);
      elements.folderNameDisplay.textContent = state.folderName;
      console.log('Target folder found:', state.folderId);
    } else {
      // 2. Folder does not exist, create it
      elements.folderNameDisplay.textContent = `${state.folderName} (作成中...)`;
      const createRes = await fetch('https://www.googleapis.com/drive/v3/files', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${state.accessToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          name: state.folderName,
          mimeType: 'application/vnd.google-apps.folder'
        })
      });
      
      const newFolder = await createRes.json();
      state.folderId = newFolder.id;
      localStorage.setItem('secphotos_folder_id', state.folderId);
      elements.folderNameDisplay.textContent = state.folderName;
      console.log('Target folder created:', state.folderId);
    }
  } catch (error) {
    console.error('Failed to verify folder:', error);
    elements.folderNameDisplay.textContent = `${state.folderName} (エラー)`;
    alert('Google Drive上のフォルダ確認に失敗しました。認証の有効期限が切れている可能性があります。');
  }
}

// Reset Client ID and return to setup screen
function resetClientId() {
  if (confirm('設定されているクライアントIDをクリアしますか？')) {
    localStorage.clear();
    state = {
      clientId: '',
      folderName: 'SecPhotos',
      accessToken: '',
      tokenExpiry: 0,
      folderId: '',
      userEmail: '',
      tokenClient: null
    };
    initUI();
  }
}

// Handle Google authentication expiration or authorization failure
function handleUnauthorized() {
  localStorage.removeItem('secphotos_access_token');
  localStorage.removeItem('secphotos_token_expiry');
  state.accessToken = '';
  state.tokenExpiry = 0;
  alert('Google Driveへのアクセス権が期限切れです。再度接続してください。');
  initUI();
}

// Settings Modal controls
function openSettings() {
  elements.settingsClientId.value = state.clientId;
  elements.settingsFolderName.value = state.folderName;
  elements.settingsQueueMode.checked = state.queueMode;
  elements.settingsModal.classList.add('active');
}

function closeSettings() {
  elements.settingsModal.classList.remove('active');
}

function saveSettings() {
  const newClientId = elements.settingsClientId.value.trim();
  const newFolderName = elements.settingsFolderName.value.trim() || 'SecPhotos';
  const newQueueMode = elements.settingsQueueMode.checked;
  
  if (!newClientId) {
    alert('クライアントIDを入力してください。');
    return;
  }
  
  let clientIdChanged = (newClientId !== state.clientId);
  let folderNameChanged = (newFolderName !== state.folderName);
  let queueModeChanged = (newQueueMode !== state.queueMode);
  
  state.clientId = newClientId;
  localStorage.setItem('secphotos_client_id', newClientId);
  
  state.folderName = newFolderName;
  localStorage.setItem('secphotos_folder_name', newFolderName);
  elements.folderNameDisplay.textContent = newFolderName;
  
  state.queueMode = newQueueMode;
  localStorage.setItem('secphotos_queue_mode', newQueueMode);
  
  closeSettings();
  updateQueueBar();
  
  if (clientIdChanged) {
    // Reset connection state since Client ID changed
    localStorage.removeItem('secphotos_access_token');
    localStorage.removeItem('secphotos_token_expiry');
    localStorage.removeItem('secphotos_folder_id');
    localStorage.removeItem('secphotos_user_email');
    state.accessToken = '';
    state.tokenExpiry = 0;
    state.folderId = '';
    state.userEmail = '';
    
    initTokenClient();
    initUI();
  } else {
    if (folderNameChanged && state.accessToken) {
      verifyFolderAndStart();
    }
    if (queueModeChanged) {
      if (!newQueueMode) {
        // If switched from Queue to Immediate, ask if they want to upload now
        getAllQueuedFiles().then(items => {
          if (items.length > 0 && confirm(`一時保存されているファイルが ${items.length} 件あります。今すぐアップロードしますか？`)) {
            uploadAllPending();
          }
        });
      }
    }
  }
}

function disconnectGoogle() {
  if (confirm('Google Driveとの接続を解除しますか？')) {
    localStorage.removeItem('secphotos_access_token');
    localStorage.removeItem('secphotos_token_expiry');
    localStorage.removeItem('secphotos_folder_id');
    localStorage.removeItem('secphotos_user_email');
    
    state.accessToken = '';
    state.tokenExpiry = 0;
    state.folderId = '';
    state.userEmail = '';
    
    closeSettings();
    initUI();
  }
}

// Media capturing & Upload queue handling
async function handleFileCapture(event) {
  const files = event.target.files;
  if (!files || files.length === 0) return;
  
  // Hide empty placeholder if present
  const placeholder = document.querySelector('.empty-list-placeholder');
  if (placeholder) {
    placeholder.remove();
  }
  
  for (let i = 0; i < files.length; i++) {
    const file = files[i];
    await queueUpload(file);
  }
  
  // Clear the input so the same file name can be captured again immediately
  event.target.value = '';
}

// Formats a file size into readable text
function formatBytes(bytes, decimals = 2) {
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const dm = decimals < 0 ? 0 : decimals;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
}

// Formats the current date/time to make safe and descriptive filenames
function getFormattedTimestamp() {
  const now = new Date();
  const yyyy = now.getFullYear();
  const mm = String(now.getMonth() + 1).padStart(2, '0');
  const dd = String(now.getDate()).padStart(2, '0');
  const hh = String(now.getHours()).padStart(2, '0');
  const min = String(now.getMinutes()).padStart(2, '0');
  const ss = String(now.getSeconds()).padStart(2, '0');
  return `${yyyy}${mm}${dd}_${hh}${min}${ss}`;
}

// Queue an item, construct its UI card, and start the upload (or save to queue)
async function queueUpload(file) {
  const timestamp = getFormattedTimestamp();
  const fileExt = file.name.split('.').pop() || (file.type.includes('video') ? 'mp4' : 'jpg');
  
  // Clean target filename to be descriptive
  const typeLabel = file.type.includes('video') ? 'video' : 'photo';
  const customFileName = `${typeLabel}_${timestamp}.${fileExt}`;
  
  const itemId = 'upload_' + Math.random().toString(36).substr(2, 9);
  
  // 1. Create UI Item
  const uploadItem = document.createElement('div');
  const initialStatus = state.queueMode ? 'pending' : 'uploading';
  uploadItem.className = `upload-item glass ${initialStatus}`;
  uploadItem.id = itemId;
  
  // Generate preview thumbnail if it's an image
  let thumbnailHTML = `<div class="upload-thumbnail"><i class="fa-solid ${file.type.includes('video') ? 'fa-video' : 'fa-image'}"></i></div>`;
  if (file.type.startsWith('image/')) {
    const objectUrl = URL.createObjectURL(file);
    thumbnailHTML = `<img src="${objectUrl}" class="upload-thumbnail" alt="preview" onload="URL.revokeObjectURL('${objectUrl}')">`;
  }
  
  const percentText = state.queueMode ? '一時保存済み' : '0%';
  const statusIconHTML = state.queueMode ? '<i class="fa-solid fa-box-archive"></i>' : '<i class="fa-solid fa-spinner"></i>';
  
  uploadItem.innerHTML = `
    ${thumbnailHTML}
    <div class="upload-details">
      <span class="upload-title">${customFileName}</span>
      <div class="upload-meta">
        <span class="upload-size">${formatBytes(file.size)}</span>
        <span class="upload-percent">${percentText}</span>
      </div>
      <div class="progress-container">
        <div class="progress-bar" style="width: 0%;"></div>
      </div>
    </div>
    <div class="upload-status-icon">
      ${statusIconHTML}
    </div>
  `;
  
  // Insert at the top of the upload list
  elements.uploadList.insertBefore(uploadItem, elements.uploadList.firstChild);
  
  // 2. Save to database first for data protection
  try {
    await saveFileToQueue(itemId, file, customFileName);
    await updateQueueBar();
  } catch (dbErr) {
    console.error('Failed to write to IndexedDB:', dbErr);
    // Continue upload even if DB write fails, but warn
  }
  
  // 3. Process Upload (unless Queue Mode is active)
  if (state.queueMode) {
    console.log('Saved locally (Queue Mode active):', customFileName);
    return;
  }
  
  try {
    // Ensure token is still valid before uploading
    if (Date.now() >= state.tokenExpiry) {
      alert('アップロード前にGoogle Driveへの再接続が必要です。認証画面を開きます。');
      connectToGoogle();
      throw new Error('OAuth token expired. Requesting refresh.');
    }
    
    if (!state.folderId) {
      await verifyFolderAndStart();
    }
    
    // Choose upload strategy: Multipart (for small files < 5MB) or Resumable (for larger files like videos)
    const threshold = 5 * 1024 * 1024;
    
    if (file.size < threshold) {
      await uploadMultipart(file, customFileName, itemId);
    } else {
      await uploadResumable(file, customFileName, itemId);
    }
    
    // Success: remove from local DB cache
    try {
      await deleteFileFromQueue(itemId);
      await updateQueueBar();
    } catch (cleanErr) {
      console.error('Error removing uploaded file from local queue:', cleanErr);
    }
    
  } catch (error) {
    console.error('Upload failed for', customFileName, error);
    updateItemStatus(itemId, 'error', error.message || 'アップロード失敗');
  }
}

// Update the UI card for a specific upload queue item
function updateItemStatus(itemId, status, message = '') {
  const item = document.getElementById(itemId);
  if (!item) return;
  
  item.className = `upload-item glass ${status}`;
  
  const percentDisplay = item.querySelector('.upload-percent');
  const statusIcon = item.querySelector('.upload-status-icon');
  
  if (status === 'success') {
    if (percentDisplay) percentDisplay.textContent = '完了';
    if (statusIcon) statusIcon.innerHTML = '<i class="fa-solid fa-circle-check"></i>';
  } else if (status === 'error') {
    if (percentDisplay) percentDisplay.textContent = message;
    if (statusIcon) statusIcon.innerHTML = '<i class="fa-solid fa-triangle-exclamation"></i>';
  }
}

// Update the progress bar and percentage display for a specific upload queue item
function updateItemProgress(itemId, percent) {
  const item = document.getElementById(itemId);
  if (!item) return;
  
  const progressBar = item.querySelector('.progress-bar');
  const percentDisplay = item.querySelector('.upload-percent');
  
  const roundedPercent = Math.round(percent);
  if (progressBar) progressBar.style.width = `${roundedPercent}%`;
  if (percentDisplay) percentDisplay.textContent = `${roundedPercent}%`;
}

// 1. Multipart Upload Protocol (Single request for metadata + data)
async function uploadMultipart(file, fileName, itemId) {
  const boundary = 'secphotos_multipart_boundary';
  
  const metadata = {
    name: fileName,
    parents: [state.folderId]
  };
  
  // Construct the multipart body
  const metadataBlob = new Blob([JSON.stringify(metadata)], { type: 'application/json; charset=UTF-8' });
  const multipartBody = new Blob([
    `\r\n--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n`,
    metadataBlob,
    `\r\n--${boundary}\r\nContent-Type: ${file.type}\r\n\r\n`,
    file,
    `\r\n--${boundary}--`
  ], { type: `multipart/related; boundary=${boundary}` });
  
  // Since fetch doesn't support upload progress out of the box in all browsers easily, 
  // we'll use XMLHttpRequest for consistent progress bar updates
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('POST', 'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart');
    
    xhr.setRequestHeader('Authorization', `Bearer ${state.accessToken}`);
    xhr.setRequestHeader('Content-Type', `multipart/related; boundary=${boundary}`);
    
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) {
        const percentComplete = (e.loaded / e.total) * 100;
        updateItemProgress(itemId, percentComplete);
      }
    };
    
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        updateItemStatus(itemId, 'success');
        resolve(JSON.parse(xhr.responseText));
      } else {
        if (xhr.status === 401) {
          handleUnauthorized();
        }
        reject(new Error(`Server responded with status ${xhr.status}`));
      }
    };
    
    xhr.onerror = () => {
      reject(new Error('Network error occurred during multipart upload.'));
    };
    
    xhr.send(multipartBody);
  });
}

// 2. Resumable Upload Protocol (Initiate, then upload file data chunk / stream)
async function uploadResumable(file, fileName, itemId) {
  // Step A: Initiate the Resumable session
  const metadata = {
    name: fileName,
    parents: [state.folderId]
  };
  
  const initiateRes = await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=resumable', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${state.accessToken}`,
      'Content-Type': 'application/json; charset=UTF-8',
      'X-Upload-Content-Type': file.type,
      'X-Upload-Content-Length': file.size
    },
    body: JSON.stringify(metadata)
  });
  
  if (initiateRes.status === 401) {
    handleUnauthorized();
    throw new Error('Unauthorized');
  }
  
  if (!initiateRes.ok) {
    throw new Error(`Failed to initiate resumable session: ${initiateRes.statusText}`);
  }
  
  // The location header contains the unique upload endpoint URL
  const uploadUrl = initiateRes.headers.get('Location');
  if (!uploadUrl) {
    throw new Error('Upload session location header missing from response.');
  }
  
  // Step B: Send the actual file data and track progress
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('PUT', uploadUrl);
    
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) {
        const percentComplete = (e.loaded / e.total) * 100;
        updateItemProgress(itemId, percentComplete);
      }
    };
    
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        updateItemStatus(itemId, 'success');
        resolve(JSON.parse(xhr.responseText));
      } else {
        reject(new Error(`Resumable upload failed with status: ${xhr.status}`));
      }
    };
    
    xhr.onerror = () => {
      reject(new Error('Network error during resumable file transfer.'));
    };
    
    xhr.send(file);
  });
}

// ==========================================
// IndexedDB and Local Storage Queue Logic
// ==========================================

// Initialize IndexedDB
function initDB() {
  return new Promise((resolve, reject) => {
    // Open Database
    const request = indexedDB.open('SecPhotosDB', 1);
    
    request.onerror = (event) => {
      console.error('IndexedDB error:', event.target.error);
      reject(event.target.error);
    };
    
    request.onsuccess = (event) => {
      db = event.target.result;
      console.log('IndexedDB connection opened successfully.');
      resolve(db);
    };
    
    request.onupgradeneeded = (event) => {
      const db = event.target.result;
      // Store to cache file objects
      const objectStore = db.createObjectStore('uploads', { keyPath: 'id' });
      objectStore.createIndex('createdAt', 'createdAt', { unique: false });
      console.log('IndexedDB database schema created/updated.');
    };
  });
}

// Save captured File to local queue
function saveFileToQueue(id, file, name) {
  return new Promise((resolve, reject) => {
    if (!db) {
      reject(new Error('Database not initialized'));
      return;
    }
    
    const transaction = db.transaction(['uploads'], 'readwrite');
    const store = transaction.objectStore('uploads');
    
    const record = {
      id: id,
      file: file,
      name: name,
      type: file.type,
      size: file.size,
      createdAt: Date.now()
    };
    
    const request = store.add(record);
    
    request.onsuccess = () => {
      resolve(record);
    };
    
    request.onerror = (e) => {
      reject(e.target.error);
    };
  });
}

// Delete file from local queue (after successful upload)
function deleteFileFromQueue(id) {
  return new Promise((resolve, reject) => {
    if (!db) {
      reject(new Error('Database not initialized'));
      return;
    }
    
    const transaction = db.transaction(['uploads'], 'readwrite');
    const store = transaction.objectStore('uploads');
    const request = store.delete(id);
    
    request.onsuccess = () => {
      resolve();
    };
    
    request.onerror = (e) => {
      reject(e.target.error);
    };
  });
}

// Get all files currently stored in local queue
function getAllQueuedFiles() {
  return new Promise((resolve, reject) => {
    if (!db) {
      resolve([]);
      return;
    }
    
    const transaction = db.transaction(['uploads'], 'readonly');
    const store = transaction.objectStore('uploads');
    const request = store.getAll();
    
    request.onsuccess = (event) => {
      resolve(event.target.result || []);
    };
    
    request.onerror = (e) => {
      reject(e.target.error);
    };
  });
}

// Update the Queue Status Bar UI
async function updateQueueBar() {
  try {
    const queuedItems = await getAllQueuedFiles();
    const count = queuedItems.length;
    
    if (count > 0) {
      let totalBytes = 0;
      queuedItems.forEach(item => totalBytes += item.size);
      
      elements.queueCount.textContent = count;
      elements.queueSize.textContent = formatBytes(totalBytes);
      elements.queueBar.style.display = 'flex';
    } else {
      elements.queueBar.style.display = 'none';
    }
    
    // Update active Mode display text
    if (elements.uploadModeDisplay) {
      elements.uploadModeDisplay.textContent = state.queueMode ? 'ローカル一時保存' : '即時送信';
    }
  } catch (err) {
    console.error('Error updating local queue UI statistics:', err);
  }
}

// Load pending queued items from database and render cards in UI
async function loadPendingIntoUI() {
  try {
    const queuedItems = await getAllQueuedFiles();
    if (queuedItems.length === 0) return;
    
    // Hide placeholder
    const placeholder = document.querySelector('.empty-list-placeholder');
    if (placeholder) {
      placeholder.remove();
    }
    
    queuedItems.forEach(item => {
      // Prevent duplicates in UI
      if (document.getElementById(item.id)) return;
      
      const uploadItem = document.createElement('div');
      uploadItem.className = 'upload-item glass pending';
      uploadItem.id = item.id;
      
      let thumbnailHTML = `<div class="upload-thumbnail"><i class="fa-solid ${item.type.includes('video') ? 'fa-video' : 'fa-image'}"></i></div>`;
      if (item.type.startsWith('image/')) {
        const objectUrl = URL.createObjectURL(item.file);
        thumbnailHTML = `<img src="${objectUrl}" class="upload-thumbnail" alt="preview" onload="URL.revokeObjectURL('${objectUrl}')">`;
      }
      
      uploadItem.innerHTML = `
        ${thumbnailHTML}
        <div class="upload-details">
          <span class="upload-title">${item.name}</span>
          <div class="upload-meta">
            <span class="upload-size">${formatBytes(item.size)}</span>
            <span class="upload-percent">一時保存済み</span>
          </div>
          <div class="progress-container">
            <div class="progress-bar" style="width: 0%;"></div>
          </div>
        </div>
        <div class="upload-status-icon">
          <i class="fa-solid fa-box-archive"></i>
        </div>
      `;
      elements.uploadList.appendChild(uploadItem);
    });
  } catch (err) {
    console.error('Error restoring pending queue to UI:', err);
  }
}

// Batch upload all items in the queue
let isBatchUploading = false;
async function uploadAllPending() {
  if (isBatchUploading) return;
  
  // Verify authentication first
  if (!state.accessToken || Date.now() >= state.tokenExpiry) {
    alert('Google Driveにアップロードするため、Google接続認証（再ログイン）を行います。');
    connectToGoogle();
    return;
  }
  
  if (!state.folderId) {
    try {
      await verifyFolderAndStart();
    } catch (e) {
      alert('フォルダの準備に失敗しました。認証を確認してください。');
      return;
    }
  }
  
  isBatchUploading = true;
  elements.uploadQueueBtn.disabled = true;
  elements.uploadQueueBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> 送信中...';
  
  try {
    const queuedItems = await getAllQueuedFiles();
    if (queuedItems.length === 0) {
      isBatchUploading = false;
      elements.uploadQueueBtn.disabled = false;
      elements.uploadQueueBtn.innerHTML = '<i class="fa-solid fa-cloud-arrow-up"></i> 一括送信';
      return;
    }
    
    // Sort oldest first
    queuedItems.sort((a, b) => a.createdAt - b.createdAt);
    
    for (const item of queuedItems) {
      // Find or create card
      let uploadItem = document.getElementById(item.id);
      if (!uploadItem) {
        uploadItem = document.createElement('div');
        uploadItem.className = 'upload-item glass uploading';
        uploadItem.id = item.id;
        
        let thumbnailHTML = `<div class="upload-thumbnail"><i class="fa-solid ${item.type.includes('video') ? 'fa-video' : 'fa-image'}"></i></div>`;
        if (item.type.startsWith('image/')) {
          const objectUrl = URL.createObjectURL(item.file);
          thumbnailHTML = `<img src="${objectUrl}" class="upload-thumbnail" alt="preview" onload="URL.revokeObjectURL('${objectUrl}')">`;
        }
        
        uploadItem.innerHTML = `
          ${thumbnailHTML}
          <div class="upload-details">
            <span class="upload-title">${item.name}</span>
            <div class="upload-meta">
              <span class="upload-size">${formatBytes(item.size)}</span>
              <span class="upload-percent">0%</span>
            </div>
            <div class="progress-container">
              <div class="progress-bar" style="width: 0%;"></div>
            </div>
          </div>
          <div class="upload-status-icon">
            <i class="fa-solid fa-spinner fa-spin"></i>
          </div>
        `;
        elements.uploadList.insertBefore(uploadItem, elements.uploadList.firstChild);
      } else {
        uploadItem.className = 'upload-item glass uploading';
        const percentText = uploadItem.querySelector('.upload-percent');
        if (percentText) percentText.textContent = '0%';
        const statusIcon = uploadItem.querySelector('.upload-status-icon');
        if (statusIcon) statusIcon.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i>';
      }
      
      try {
        const threshold = 5 * 1024 * 1024;
        
        if (item.size < threshold) {
          await uploadMultipart(item.file, item.name, item.id);
        } else {
          await uploadResumable(item.file, item.name, item.id);
        }
        
        // Remove from DB on success
        await deleteFileFromQueue(item.id);
      } catch (err) {
        console.error(`Failed uploading queued file ${item.name}:`, err);
        updateItemStatus(item.id, 'error', 'アップロード失敗');
      }
      
      await updateQueueBar();
    }
  } catch (error) {
    console.error('Error running bulk queue upload:', error);
    alert('一括送信中にエラーが発生しました。ネットワーク接続を確認してください。');
  } finally {
    isBatchUploading = false;
    elements.uploadQueueBtn.disabled = false;
    elements.uploadQueueBtn.innerHTML = '<i class="fa-solid fa-cloud-arrow-up"></i> 一括送信';
    await updateQueueBar();
  }
}
