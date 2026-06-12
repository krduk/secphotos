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
  tokenClient: null,
  driveFiles: [],
  currentViewerBlobUrl: null,
  currentViewerFile: null,
  availableTags: (() => {
    try {
      const stored = localStorage.getItem('secphotos_available_tags');
      return stored ? JSON.parse(stored) : ['野球', '酒'];
    } catch (e) {
      console.error('Failed to parse stored tags:', e);
      return ['野球', '酒'];
    }
  })(),
  presetSelectedTags: []
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
  
  appNav: document.getElementById('app-nav'),
  navCaptureBtn: document.getElementById('nav-capture-btn'),
  navHistoryBtn: document.getElementById('nav-history-btn'),
  
  dateFilter: document.getElementById('date-filter'),
  tagFilter: document.getElementById('tag-filter'),
  refreshGalleryBtn: document.getElementById('refresh-gallery-btn'),
  galleryGrid: document.getElementById('gallery-grid'),
  
  viewerModal: document.getElementById('viewer-modal'),
  viewerCloseBtn: document.getElementById('viewer-close-btn'),
  viewerMediaWrapper: document.getElementById('viewer-media-wrapper'),
  viewerFilename: document.getElementById('viewer-filename'),
  viewerDownloadLink: document.getElementById('viewer-download-link'),
  viewerDeleteBtn: document.getElementById('viewer-delete-btn'),
  viewerTagsContainer: document.getElementById('viewer-tags-container'),
  viewerEditTagsBtn: document.getElementById('viewer-edit-tags-btn'),
  
  viewerTagEditor: document.getElementById('viewer-tag-editor'),
  editorCloseBtn: document.getElementById('editor-close-btn'),
  editorTagsList: document.getElementById('editor-tags-list'),
  editorNewTagInput: document.getElementById('editor-new-tag-input'),
  editorAddTagBtn: document.getElementById('editor-add-tag-btn'),
  editorSaveBtn: document.getElementById('editor-save-btn'),
  
  presetNewTagInput: document.getElementById('preset-new-tag-input'),
  presetAddTagBtn: document.getElementById('preset-add-tag-btn'),
  presetTagsContainer: document.getElementById('preset-tags-container'),
  
  settingsToggleBtn: document.getElementById('settings-toggle-btn'),
  settingsModal: document.getElementById('settings-modal'),
  settingsCloseBtn: document.getElementById('settings-close-btn'),
  settingsClientId: document.getElementById('settings-client-id'),
  settingsFolderName: document.getElementById('settings-folder-name'),
  settingsQueueMode: document.getElementById('settings-queue-mode'),
  settingsSaveBtn: document.getElementById('settings-save-btn'),
  disconnectBtn: document.getElementById('disconnect-btn')
};

// Calculate mobile viewport height (fixes iOS Safari 100vh toolbar issues)
function adjustViewportHeight() {
  const vh = window.innerHeight * 0.01;
  document.documentElement.style.setProperty('--vh', `${vh}px`);
}

// Initialize Application
document.addEventListener('DOMContentLoaded', () => {
  adjustViewportHeight();
  window.addEventListener('resize', adjustViewportHeight);
  window.addEventListener('orientationchange', adjustViewportHeight);
  
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
      scope: 'https://www.googleapis.com/auth/drive https://www.googleapis.com/auth/userinfo.email',
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

  // Navigation tab controls
  elements.navCaptureBtn.addEventListener('click', () => switchTab('capture'));
  elements.navHistoryBtn.addEventListener('click', () => switchTab('history'));

  // Gallery interactions
  elements.refreshGalleryBtn.addEventListener('click', loadGallery);
  elements.dateFilter.addEventListener('change', handleFilterChange);
  elements.tagFilter.addEventListener('change', handleFilterChange);

  // Viewer modal interactions
  elements.viewerCloseBtn.addEventListener('click', closeMediaViewer);
  elements.viewerDeleteBtn.addEventListener('click', handleDeleteFile);
  elements.viewerEditTagsBtn.addEventListener('click', openTagEditor);
  elements.editorCloseBtn.addEventListener('click', closeTagEditor);
  elements.editorAddTagBtn.addEventListener('click', handleAddEditorTag);
  elements.editorNewTagInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') handleAddEditorTag();
  });
  elements.editorSaveBtn.addEventListener('click', handleSaveEditorTags);

  // Preset tag interactions
  elements.presetAddTagBtn.addEventListener('click', handleAddPresetTag);
  elements.presetNewTagInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') handleAddPresetTag();
  });

  window.addEventListener('click', (e) => {
    if (e.target === elements.viewerModal) {
      closeMediaViewer();
    }
  });
}

// Tab Switching
function switchTab(tab) {
  if (tab === 'capture') {
    elements.navCaptureBtn.classList.add('active');
    elements.navHistoryBtn.classList.remove('active');
    showView('capture-tab-view');
  } else if (tab === 'history') {
    elements.navCaptureBtn.classList.remove('active');
    elements.navHistoryBtn.classList.add('active');
    showView('history-tab-view');
    loadGallery();
  }
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
    showView('capture-tab-view');
    verifyFolderAndStart();
    loadPendingIntoUI();
  }
  
  // Render tag preset panel
  initTagsUI();
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

  // Show/Hide bottom navigation depending on authentication state
  if (viewId === 'capture-tab-view' || viewId === 'history-tab-view') {
    elements.appNav.style.display = 'flex';
  } else {
    elements.appNav.style.display = 'none';
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
  showView('capture-tab-view');
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
// HEIC画像をJPEGに変換する関数
async function convertHeicToJpeg(file) {
  const isHeic = file.name.toLowerCase().endsWith('.heic') || 
                 file.name.toLowerCase().endsWith('.heif') || 
                 file.type === 'image/heic' || 
                 file.type === 'image/heif';
                 
  if (!isHeic) return file;
  
  if (typeof heic2any === 'undefined') {
    console.warn('heic2any library is not loaded. Uploading HEIC file directly.');
    return file;
  }
  
  try {
    console.log('Converting HEIC to JPEG:', file.name);
    const jpegBlob = await heic2any({
      blob: file,
      toType: 'image/jpeg',
      quality: 0.85
    });
    
    const resultBlob = Array.isArray(jpegBlob) ? jpegBlob[0] : jpegBlob;
    const newName = file.name.replace(/\.(heic|heif)$/i, '.jpg');
    
    return new File([resultBlob], newName, {
      type: 'image/jpeg',
      lastModified: file.lastModified || Date.now()
    });
  } catch (error) {
    console.error('HEIC to JPEG conversion failed:', error);
    return file;
  }
}

// Queue an item, construct its UI card, and start the upload (or save to queue)
async function queueUpload(originalFile) {
  const timestamp = getFormattedTimestamp();
  
  const isHeic = originalFile.name.toLowerCase().endsWith('.heic') || 
                 originalFile.name.toLowerCase().endsWith('.heif') || 
                 originalFile.type === 'image/heic' || 
                 originalFile.type === 'image/heif';
  
  const itemId = 'upload_' + Math.random().toString(36).substr(2, 9);
  
  // 1. Create UI Item
  const initialStatus = isHeic ? 'converting' : (state.queueMode ? 'pending' : 'uploading');
  const uploadItem = document.createElement('div');
  uploadItem.className = `upload-item glass ${initialStatus}`;
  uploadItem.id = itemId;
  
  let thumbnailHTML = `<div class="upload-thumbnail"><i class="fa-solid ${originalFile.type.includes('video') ? 'fa-video' : 'fa-image'}"></i></div>`;
  if (!isHeic && originalFile.type.startsWith('image/')) {
    const objectUrl = URL.createObjectURL(originalFile);
    thumbnailHTML = `<img src="${objectUrl}" class="upload-thumbnail" alt="preview" onload="URL.revokeObjectURL('${objectUrl}')">`;
  }
  
  const percentText = isHeic ? 'JPEG変換中...' : (state.queueMode ? '一時保存済み' : '0%');
  const statusIconHTML = isHeic ? '<i class="fa-solid fa-arrows-rotate fa-spin"></i>' : (state.queueMode ? '<i class="fa-solid fa-box-archive"></i>' : '<i class="fa-solid fa-spinner"></i>');
  
  let fileExt = originalFile.name.split('.').pop() || (originalFile.type.includes('video') ? 'mp4' : 'jpg');
  if (isHeic) fileExt = 'jpg';
  
  const typeLabel = originalFile.type.includes('video') ? 'video' : 'photo';
  const customFileName = `${typeLabel}_${timestamp}.${fileExt}`;
  
  uploadItem.innerHTML = `
    ${thumbnailHTML}
    <div class="upload-details">
      <span class="upload-title">${customFileName}</span>
      <div class="upload-meta">
        <span class="upload-size">${formatBytes(originalFile.size)}</span>
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
  
  elements.uploadList.insertBefore(uploadItem, elements.uploadList.firstChild);
  
  let file = originalFile;
  if (isHeic) {
    file = await convertHeicToJpeg(originalFile);
    
    // Update thumbnail with converted image
    const convertedItem = document.getElementById(itemId);
    if (convertedItem) {
      if (file.type.startsWith('image/')) {
        const img = document.createElement('img');
        img.className = 'upload-thumbnail';
        img.alt = 'preview';
        const objectUrl = URL.createObjectURL(file);
        img.src = objectUrl;
        img.onload = () => URL.revokeObjectURL(objectUrl);
        
        const oldThumb = convertedItem.querySelector('.upload-thumbnail');
        if (oldThumb) oldThumb.replaceWith(img);
      }
      
      convertedItem.className = `upload-item glass ${state.queueMode ? 'pending' : 'uploading'}`;
      
      const percentDisplay = convertedItem.querySelector('.upload-percent');
      if (percentDisplay) percentDisplay.textContent = state.queueMode ? '一時保存済み' : '0%';
      
      const statusIcon = convertedItem.querySelector('.upload-status-icon');
      if (statusIcon) {
        statusIcon.innerHTML = state.queueMode ? '<i class="fa-solid fa-box-archive"></i>' : '<i class="fa-solid fa-spinner"></i>';
      }
      
      const sizeDisplay = convertedItem.querySelector('.upload-size');
      if (sizeDisplay) sizeDisplay.textContent = formatBytes(file.size);
    }
  }
  
  // 2. Save to database first for data protection
  try {
    const tagsString = state.presetSelectedTags.join(',');
    await saveFileToQueue(itemId, file, customFileName, tagsString);
    await updateQueueBar();
  } catch (dbErr) {
    console.error('Failed to write to IndexedDB:', dbErr);
  }
  
  // 3. Process Upload (unless Queue Mode is active)
  if (state.queueMode) {
    console.log('Saved locally (Queue Mode active):', customFileName);
    return;
  }
  
  try {
    if (Date.now() >= state.tokenExpiry) {
      alert('アップロード前にGoogle Driveへの再接続が必要です。認証画面を開きます。');
      connectToGoogle();
      throw new Error('OAuth token expired. Requesting refresh.');
    }
    
    if (!state.folderId) {
      await verifyFolderAndStart();
    }
    
    const threshold = 5 * 1024 * 1024;
    const tagsString = state.presetSelectedTags.join(',');
    
    if (file.size < threshold) {
      await uploadMultipart(file, customFileName, itemId, tagsString);
    } else {
      await uploadResumable(file, customFileName, itemId, tagsString);
    }
    
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
async function uploadMultipart(file, fileName, itemId, tagsString = '') {
  const boundary = 'secphotos_multipart_boundary';
  
  const metadata = {
    name: fileName,
    parents: [state.folderId]
  };
  
  if (tagsString) {
    metadata.appProperties = { tags: tagsString };
  }
  
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
async function uploadResumable(file, fileName, itemId, tagsString = '') {
  // Step A: Initiate the Resumable session
  const metadata = {
    name: fileName,
    parents: [state.folderId]
  };
  
  if (tagsString) {
    metadata.appProperties = { tags: tagsString };
  }
  
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
function saveFileToQueue(id, file, name, tags = '') {
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
      tags: tags,
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
          await uploadMultipart(item.file, item.name, item.id, item.tags || '');
        } else {
          await uploadResumable(item.file, item.name, item.id, item.tags || '');
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

// ==========================================
// Google Drive Gallery / History Tab Logic
// ==========================================

// Parse file created date into local date format (YYYY/MM/DD)
function getLocalDateString(isoString) {
  const d = new Date(isoString);
  if (isNaN(d.getTime())) return '不明な日付';
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${yyyy}/${mm}/${dd}`;
}

// Load gallery contents from Google Drive
async function loadGallery() {
  elements.galleryGrid.innerHTML = `
    <div class="gallery-placeholder">
      <i class="fa-solid fa-spinner fa-spin"></i>
      <p>Google Driveからファイル一覧を読み込んでいます...</p>
    </div>
  `;
  
  try {
    if (!state.accessToken || Date.now() >= state.tokenExpiry) {
      alert('閲覧するにはGoogle Driveへの再接続（ログイン）が必要です。');
      connectToGoogle();
      return;
    }
    
    if (!state.folderId) {
      await verifyFolderAndStart();
    }
    
    // Fetch files in the SecPhotos folder
    const files = await fetchDriveFiles();
    state.driveFiles = files;
    
    // Build date & tag filters
    populateFilters(files);
    
    // Render files in Grid
    renderGalleryGrid('all', 'all');
    
  } catch (error) {
    console.error('Failed to load gallery:', error);
    elements.galleryGrid.innerHTML = `
      <div class="gallery-placeholder">
        <i class="fa-solid fa-triangle-exclamation" style="color: var(--danger);"></i>
        <p>データの読み込みに失敗しました。</p>
        <button onclick="loadGallery()" class="btn primary-btn compact-btn" style="margin-top: 10px;">再試行</button>
      </div>
    `;
  }
}

// Fetch file metadata from Google Drive folder
async function fetchDriveFiles() {
  const query = `'${state.folderId}' in parents and trashed = false`;
  const url = `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(query)}&orderBy=name desc&pageSize=200&fields=files(id,name,mimeType,thumbnailLink,webContentLink,createdTime,size,appProperties)`;
  
  const response = await fetch(url, {
    headers: { 'Authorization': `Bearer ${state.accessToken}` }
  });
  
  if (response.status === 401) {
    handleUnauthorized();
    throw new Error('Authentication expired');
  }
  
  if (!response.ok) {
    throw new Error(`Google API error: ${response.statusText}`);
  }
  
  const data = await response.json();
  return data.files || [];
}

// Extract unique dates and tags, populating both dropdown filters
function populateFilters(files) {
  // Save current values to restore them after populate
  const currentDateFilterVal = elements.dateFilter.value;
  const currentTagFilterVal = elements.tagFilter.value;
  
  // Clear select elements
  elements.dateFilter.innerHTML = '<option value="all">すべてのデータ</option>';
  elements.tagFilter.innerHTML = '<option value="all">すべてのタグ</option>';
  
  const dates = new Set();
  const tags = new Set();
  
  files.forEach(file => {
    if (file.createdTime) {
      dates.add(getLocalDateString(file.createdTime));
    }
    if (file.appProperties && file.appProperties.tags) {
      file.appProperties.tags.split(',').forEach(tag => {
        if (tag) tags.add(tag);
      });
    }
  });
  
  // Populate dates dropdown (newest first)
  const sortedDates = Array.from(dates).sort((a, b) => b.localeCompare(a));
  sortedDates.forEach(date => {
    const option = document.createElement('option');
    option.value = date;
    const parts = date.split('/');
    option.textContent = `${parts[0]}年${parts[1]}月${parts[2]}日`;
    elements.dateFilter.appendChild(option);
  });
  
  // Populate tags dropdown (alphabetical sort)
  const sortedTags = Array.from(tags).sort();
  sortedTags.forEach(tag => {
    const option = document.createElement('option');
    option.value = tag;
    option.textContent = tag;
    elements.tagFilter.appendChild(option);
  });
  
  // Restore selections if they still exist, otherwise default to 'all'
  if (Array.from(elements.dateFilter.options).some(opt => opt.value === currentDateFilterVal)) {
    elements.dateFilter.value = currentDateFilterVal;
  }
  if (Array.from(elements.tagFilter.options).some(opt => opt.value === currentTagFilterVal)) {
    elements.tagFilter.value = currentTagFilterVal;
  }
}

// Render filtered files list into the gallery grid
function renderGalleryGrid(dateFilterValue = 'all', tagFilterValue = 'all') {
  elements.galleryGrid.innerHTML = '';
  
  // Filter files by date AND tag
  const filteredFiles = state.driveFiles.filter(file => {
    const matchDate = (dateFilterValue === 'all') || (getLocalDateString(file.createdTime) === dateFilterValue);
    
    let matchTag = (tagFilterValue === 'all');
    if (!matchTag && file.appProperties && file.appProperties.tags) {
      matchTag = file.appProperties.tags.split(',').includes(tagFilterValue);
    }
    
    return matchDate && matchTag;
  });
  
  if (filteredFiles.length === 0) {
    elements.galleryGrid.innerHTML = `
      <div class="gallery-placeholder">
        <i class="fa-solid fa-box-open"></i>
        <p>該当するファイルはありません。</p>
      </div>
    `;
    return;
  }
  
  filteredFiles.forEach(file => {
    const card = document.createElement('div');
    card.className = 'gallery-card glass';
    card.addEventListener('click', () => openMediaViewer(file.id, file.name, file.mimeType));
    
    // Check file type
    const isVideo = file.mimeType.startsWith('video/');
    
    // Google Drive's thumbnailLink usually works directly (publicly authenticated URL)
    if (file.thumbnailLink) {
      const thumbnailSrc = file.thumbnailLink;
      
      const img = document.createElement('img');
      img.src = thumbnailSrc;
      img.className = 'gallery-card-img';
      img.alt = file.name;
      img.loading = 'lazy';
      
      // Fallback in case thumbnail fails loading
      img.onerror = () => {
        img.remove();
        card.appendChild(createCardFallback(file.name, isVideo));
      };
      
      card.appendChild(img);
    } else {
      card.appendChild(createCardFallback(file.name, isVideo));
    }
    
    // Add overlay play icon for video files
    if (isVideo) {
      const videoIcon = document.createElement('div');
      videoIcon.className = 'video-overlay-icon';
      videoIcon.innerHTML = '<i class="fa-solid fa-play"></i>';
      card.appendChild(videoIcon);
    }
    
    // Add tag badges overlay on top of thumbnails
    if (file.appProperties && file.appProperties.tags) {
      const tagsOverlay = document.createElement('div');
      tagsOverlay.className = 'gallery-card-tags-overlay';
      
      file.appProperties.tags.split(',').forEach(tag => {
        if (tag) {
          const badge = document.createElement('span');
          badge.className = 'tag-badge';
          badge.textContent = tag;
          tagsOverlay.appendChild(badge);
        }
      });
      card.appendChild(tagsOverlay);
    }
    
    elements.galleryGrid.appendChild(card);
  });
}

// Create fallback layout for cards without thumbnails
function createCardFallback(fileName, isVideo) {
  const fallback = document.createElement('div');
  fallback.className = 'gallery-card-fallback';
  
  const icon = document.createElement('i');
  icon.className = `fa-solid ${isVideo ? 'fa-film' : 'fa-file-image'}`;
  fallback.appendChild(icon);
  
  const label = document.createElement('span');
  label.textContent = fileName;
  fallback.appendChild(label);
  
  return fallback;
}

// ==========================================
// Fullscreen Media Viewer Logic
// ==========================================

// Open Fullscreen Viewer and load full media file
async function openMediaViewer(fileId, fileName, mimeType) {
  // Find file object
  state.currentViewerFile = state.driveFiles.find(f => f.id === fileId);
  
  // Show modal and start loading spinner
  elements.viewerModal.classList.add('active');
  elements.appNav.style.display = 'none'; // Hide bottom navigation bar
  elements.viewerFilename.textContent = fileName;
  
  elements.viewerMediaWrapper.innerHTML = `
    <div class="viewer-spinner">
      <i class="fa-solid fa-circle-notch fa-spin"></i>
      <p>高画質データを読み込んでいます...</p>
    </div>
  `;
  
  // Render applied tags
  renderViewerTags();
  
  // Reset download button
  elements.viewerDownloadLink.removeAttribute('href');
  elements.viewerDownloadLink.style.pointerEvents = 'none';
  elements.viewerDownloadLink.style.opacity = '0.5';
  
  try {
    // Fetch media content from Google Drive API with alt=media
    const response = await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`, {
      headers: { 'Authorization': `Bearer ${state.accessToken}` }
    });
    
    if (response.status === 401) {
      closeMediaViewer();
      handleUnauthorized();
      return;
    }
    
    if (!response.ok) {
      throw new Error(`Failed to load file: ${response.statusText}`);
    }
    
    // Create Blob Object URL
    let blob = await response.blob();
    
    const isHeic = fileName.toLowerCase().endsWith('.heic') || 
                   fileName.toLowerCase().endsWith('.heif') || 
                   mimeType === 'image/heic' || 
                   mimeType === 'image/heif';
    
    if (isHeic) {
      elements.viewerMediaWrapper.innerHTML = `
        <div class="viewer-spinner">
          <i class="fa-solid fa-arrows-rotate fa-spin"></i>
          <p>HEIC画像をJPEGに変換しています...</p>
        </div>
      `;
      
      if (typeof heic2any !== 'undefined') {
        try {
          console.log('Converting HEIC drive file to JPEG for viewing:', fileName);
          const jpegBlob = await heic2any({
            blob: blob,
            toType: 'image/jpeg',
            quality: 0.8
          });
          blob = Array.isArray(jpegBlob) ? jpegBlob[0] : jpegBlob;
        } catch (convErr) {
          console.error('HEIC to JPEG conversion in viewer failed:', convErr);
        }
      } else {
        console.warn('heic2any library is not loaded. Cannot convert HEIC in viewer.');
      }
    }
    
    const blobUrl = URL.createObjectURL(blob);
    state.currentViewerBlobUrl = blobUrl;
    
    // Render media content
    elements.viewerMediaWrapper.innerHTML = '';
    
    if (mimeType.startsWith('image/') || isHeic) {
      const img = document.createElement('img');
      img.src = blobUrl;
      img.alt = fileName;
      elements.viewerMediaWrapper.appendChild(img);
    } else if (mimeType.startsWith('video/')) {
      const video = document.createElement('video');
      video.src = blobUrl;
      video.controls = true;
      video.autoplay = true;
      elements.viewerMediaWrapper.appendChild(video);
    } else {
      // Fallback for unsupported mime types
      elements.viewerMediaWrapper.innerHTML = `
        <div class="viewer-spinner">
          <i class="fa-solid fa-file-arrow-down" style="font-size: 3rem;"></i>
          <p>このファイル形式はプレビューできません</p>
        </div>
      `;
    }
    
    // Configure download link
    elements.viewerDownloadLink.href = blobUrl;
    elements.viewerDownloadLink.download = isHeic ? fileName.replace(/\.(heic|heif)$/i, '.jpg') : fileName;
    elements.viewerDownloadLink.style.pointerEvents = 'auto';
    elements.viewerDownloadLink.style.opacity = '1';
    
  } catch (error) {
    console.error('Failed to load media in viewer:', error);
    elements.viewerMediaWrapper.innerHTML = `
      <div class="viewer-spinner">
        <i class="fa-solid fa-circle-exclamation" style="font-size: 3rem; color: var(--danger);"></i>
        <p>ファイルのダウンロードに失敗しました。</p>
      </div>
    `;
  }
}

// Close viewer and clean up Blob URL to prevent memory leaks
function closeMediaViewer() {
  elements.viewerModal.classList.remove('active');
  elements.appNav.style.display = 'flex'; // Restore bottom navigation bar
  closeTagEditor();
  
  // Pause any video playing inside viewer
  const video = elements.viewerMediaWrapper.querySelector('video');
  if (video) {
    video.pause();
  }
  
  elements.viewerMediaWrapper.innerHTML = '';
  state.currentViewerFile = null;
  
  // Revoke Blob URL to free up browser memory
  if (state.currentViewerBlobUrl) {
    URL.revokeObjectURL(state.currentViewerBlobUrl);
    state.currentViewerBlobUrl = null;
  }
}

// ==========================================
// Tag Management & UI Logic
// ==========================================

// Render Preset selection pills in Capture tab
function initTagsUI() {
  elements.presetTagsContainer.innerHTML = '';
  
  state.availableTags.forEach(tag => {
    const pill = document.createElement('button');
    pill.type = 'button';
    const isActive = state.presetSelectedTags.includes(tag);
    pill.className = `tag-pill ${isActive ? 'active' : ''}`;
    pill.textContent = tag;
    
    pill.addEventListener('click', () => {
      if (state.presetSelectedTags.includes(tag)) {
        state.presetSelectedTags = state.presetSelectedTags.filter(t => t !== tag);
      } else {
        state.presetSelectedTags.push(tag);
      }
      initTagsUI();
    });
    
    elements.presetTagsContainer.appendChild(pill);
  });
}

// Add custom tag from preset input form
function handleAddPresetTag() {
  const newTag = elements.presetNewTagInput.value.trim();
  if (!newTag) return;
  
  if (state.availableTags.includes(newTag)) {
    alert('そのタグは既に存在します。');
    return;
  }
  
  state.availableTags.push(newTag);
  localStorage.setItem('secphotos_available_tags', JSON.stringify(state.availableTags));
  
  // Automatically select the newly created tag
  state.presetSelectedTags.push(newTag);
  
  elements.presetNewTagInput.value = '';
  initTagsUI();
}

// Combined Date & Tag Filters change handler
function handleFilterChange() {
  const dateVal = elements.dateFilter.value;
  const tagVal = elements.tagFilter.value;
  renderGalleryGrid(dateVal, tagVal);
}

// Render viewer tags in media viewer footer
function renderViewerTags() {
  elements.viewerTagsContainer.innerHTML = '';
  
  const file = state.currentViewerFile;
  if (!file) return;
  
  const tagsString = file.appProperties ? file.appProperties.tags : '';
  if (!tagsString) {
    elements.viewerTagsContainer.innerHTML = '<span style="color: var(--text-secondary); font-size: 0.72rem;">タグなし</span>';
    return;
  }
  
  tagsString.split(',').forEach(tag => {
    if (tag) {
      const pill = document.createElement('button');
      pill.type = 'button';
      pill.className = 'tag-pill';
      pill.textContent = tag;
      elements.viewerTagsContainer.appendChild(pill);
    }
  });
}

// Open tag editor panel
function openTagEditor() {
  elements.editorTagsList.innerHTML = '';
  elements.viewerTagEditor.style.display = 'flex';
  
  const file = state.currentViewerFile;
  const activeTags = file && file.appProperties && file.appProperties.tags 
    ? file.appProperties.tags.split(',') 
    : [];
    
  state.availableTags.forEach(tag => {
    const isChecked = activeTags.includes(tag);
    
    const label = document.createElement('label');
    label.className = `editor-tag-checkbox-label ${isChecked ? 'checked' : ''}`;
    
    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.value = tag;
    checkbox.checked = isChecked;
    
    checkbox.addEventListener('change', () => {
      if (checkbox.checked) {
        label.classList.add('checked');
      } else {
        label.classList.remove('checked');
      }
    });
    
    label.appendChild(checkbox);
    label.appendChild(document.createTextNode(tag));
    
    elements.editorTagsList.appendChild(label);
  });
}

// Close tag editor panel
function closeTagEditor() {
  elements.viewerTagEditor.style.display = 'none';
  elements.editorNewTagInput.value = '';
}

// Add tag inside the editor list
function handleAddEditorTag() {
  const newTag = elements.editorNewTagInput.value.trim();
  if (!newTag) return;
  
  if (state.availableTags.includes(newTag)) {
    alert('そのタグは既に存在します。');
    return;
  }
  
  state.availableTags.push(newTag);
  localStorage.setItem('secphotos_available_tags', JSON.stringify(state.availableTags));
  
  // Re-render tag editor with the new tag checked
  const label = document.createElement('label');
  label.className = 'editor-tag-checkbox-label checked';
  
  const checkbox = document.createElement('input');
  checkbox.type = 'checkbox';
  checkbox.value = newTag;
  checkbox.checked = true;
  
  checkbox.addEventListener('change', () => {
    if (checkbox.checked) {
      label.classList.add('checked');
    } else {
      label.classList.remove('checked');
    }
  });
  
  label.appendChild(checkbox);
  label.appendChild(document.createTextNode(newTag));
  
  elements.editorTagsList.appendChild(label);
  elements.editorNewTagInput.value = '';
  
  // Also refresh preset UI so it is available in capture tab
  initTagsUI();
}

// Save edited tags on Google Drive API
async function handleSaveEditorTags() {
  const file = state.currentViewerFile;
  if (!file) return;
  
  // Collect all checked tags
  const selected = [];
  elements.editorTagsList.querySelectorAll('input[type="checkbox"]').forEach(cb => {
    if (cb.checked) {
      selected.push(cb.value);
    }
  });
  
  const tagsString = selected.join(',');
  
  // Update UI to saving state
  elements.editorSaveBtn.disabled = true;
  elements.editorSaveBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> 保存中...';
  
  try {
    // Send PATCH request to Google Drive to update metadata properties
    const res = await fetch(`https://www.googleapis.com/drive/v3/files/${file.id}`, {
      method: 'PATCH',
      headers: {
        'Authorization': `Bearer ${state.accessToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        appProperties: {
          tags: tagsString
        }
      })
    });
    
    if (res.status === 401) {
      closeTagEditor();
      closeMediaViewer();
      handleUnauthorized();
      return;
    }
    
    if (!res.ok) {
      throw new Error(`Google API error: ${res.statusText}`);
    }
    
    // Update local file state
    if (!file.appProperties) file.appProperties = {};
    file.appProperties.tags = tagsString;
    
    // Update matching entry in state.driveFiles
    const index = state.driveFiles.findIndex(f => f.id === file.id);
    if (index !== -1) {
      state.driveFiles[index] = file;
    }
    
    // Refresh UIs
    renderViewerTags();
    populateFilters(state.driveFiles);
    handleFilterChange();
    closeTagEditor();
    
  } catch (err) {
    console.error('Failed to update file tags:', err);
    alert('タグの保存に失敗しました。');
  } finally {
    elements.editorSaveBtn.disabled = false;
    elements.editorSaveBtn.innerHTML = '<i class="fa-solid fa-check"></i> 変更を保存';
  }
}

// Delete media file from Google Drive
async function handleDeleteFile() {
  const file = state.currentViewerFile;
  if (!file) return;
  
  const confirmMsg = file.mimeType.startsWith('video/') 
    ? 'この動画をGoogle Driveから完全に削除しますか？\n(削除すると元に戻せません)' 
    : 'この写真をGoogle Driveから完全に削除しますか？\n(削除すると元に戻せません)';
    
  if (!confirm(confirmMsg)) {
    return;
  }
  
  // Update button to loading state
  elements.viewerDeleteBtn.disabled = true;
  elements.viewerDeleteBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> 削除中...';
  
  try {
    // Send DELETE request to Google Drive API
    const res = await fetch(`https://www.googleapis.com/drive/v3/files/${file.id}`, {
      method: 'DELETE',
      headers: {
        'Authorization': `Bearer ${state.accessToken}`
      }
    });
    
    if (res.status === 401) {
      closeMediaViewer();
      handleUnauthorized();
      return;
    }
    
    if (!res.ok) {
      throw new Error(`Google API error: ${res.statusText}`);
    }
    
    // Remove from in-memory file array
    state.driveFiles = state.driveFiles.filter(f => f.id !== file.id);
    
    // Close viewer and refresh gallery view
    closeMediaViewer();
    populateFilters(state.driveFiles);
    handleFilterChange();
    
  } catch (err) {
    console.error('Failed to delete file from Google Drive:', err);
    alert('ファイルの削除に失敗しました。ネットワーク状況を確認してください。');
  } finally {
    elements.viewerDeleteBtn.disabled = false;
    elements.viewerDeleteBtn.innerHTML = '<i class="fa-solid fa-trash-can"></i> 削除';
  }
}
