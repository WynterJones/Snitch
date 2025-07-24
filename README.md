# Senator - Network Interception & AI Analysis

A powerful Chrome extension for network request interception, logging, and AI-powered analysis designed for non-technical users.

## Features

### 🔍 Network Monitoring

- **Real-time Request Logging**: Captures all network requests in real-time
- **Request Details**: Method, URL, headers, request body, and response data
- **Status Tracking**: Monitors request success/failure with visual indicators
- **Tab-based Organization**: Separate logs for each browser tab

### 🤖 AI-Powered Analysis

- **OpenAI Integration**: Uses GPT-3.5-turbo for intelligent request analysis
- **Plain English Explanations**: Converts technical network data into understandable insights
- **Context-Aware Analysis**: Explains what each request does and why it matters
- **Non-Technical Friendly**: Designed for users without technical background

### 🎨 User Interface

- **Modern Popup Interface**: Clean, intuitive popup with statistics and controls
- **Settings Panel**: Collapsible settings panel with gear icon
- **Request Detail Modal**: Clean modal view for request details with formatted JSON
- **Badge Counters**: Visual indicators showing request activity per tab

### 📊 Data Management

- **Clear Logs**: Easy cleanup of captured data
- **Statistics Dashboard**: Real-time metrics and request counts
- **Persistent Storage**: Logs persist across browser sessions

## Installation

### Development Installation

1. Clone or download this repository
2. Open Chrome and navigate to `chrome://extensions/`
3. Enable "Developer mode" in the top right
4. Click "Load unpacked" and select the Senator folder
5. The extension icon should appear in your toolbar

### Chrome Web Store (Coming Soon)

- Search for "Senator Network Logger" in the Chrome Web Store
- Click "Add to Chrome" to install

## Setup

### OpenAI API Key Configuration

1. Get an OpenAI API key from [OpenAI Platform](https://platform.openai.com/api-keys)
2. Click the Senator extension icon in your toolbar
3. Enter your API key in the "OpenAI API Key" field
4. Click "Save API Key"

## Usage

### Basic Monitoring

1. **Start Monitoring**: Simply browse any website - Senator automatically captures network requests
2. **View Logs**: Click the Senator icon to see recent requests in the popup
3. **View Details**: Click on any request to see detailed information in a clean modal
4. **Settings**: Click the gear icon (⚙️) to access settings and API key configuration

### AI Analysis

1. **Get Explanations**: Click "Explain with AI" on any request in the sidebar
2. **Understand Requests**: Read plain English explanations of what each request does
3. **Identify Issues**: AI highlights potential problems or interesting aspects

### Data Management

1. **Clear Logs**: Use "Clear Logs" to remove captured data
2. **View Details**: Click on any request to see formatted JSON and detailed information

## Technical Details

### Architecture

- **Manifest V3**: Modern Chrome extension architecture
- **Service Worker**: Background script for request interception
- **Content Script**: In-page sidebar injection
- **Storage API**: Chrome storage for data persistence

### Permissions

- `webRequest`: Network request interception
- `storage`: Data persistence
- `activeTab`: Current tab access
- `scripting`: Content script injection
- `tabs`: Tab management
- `<all_urls>`: Cross-site request monitoring

### Data Captured

- Request method (GET, POST, etc.)
- Full URL
- Request headers and body
- Response status and headers
- Timestamp and tab information
- Request type (main_frame, sub_frame, stylesheet, etc.)

## Privacy & Security

### Data Handling

- **Local Storage**: All data is stored locally in your browser
- **No External Transmission**: Request data is never sent to external servers (except OpenAI for analysis)
- **API Key Security**: Your OpenAI API key is stored securely in Chrome's local storage
- **Selective Analysis**: Only requests you explicitly analyze are sent to OpenAI

### OpenAI Usage

- **Opt-in Analysis**: AI analysis is only performed when you request it
- **Data Privacy**: Only request metadata is sent to OpenAI (no sensitive content)
- **Rate Limiting**: Built-in safeguards to prevent excessive API usage

## Troubleshooting

### Common Issues

**Extension not capturing requests:**

- Ensure the extension is enabled in `chrome://extensions/`
- Check that you're browsing regular websites (not chrome:// pages)
- Try refreshing the page

**AI explanations not working:**

- Verify your OpenAI API key is correctly set
- Check your OpenAI account has available credits
- Ensure you have internet connectivity

**Sidebar not appearing:**

- Use the keyboard shortcut Ctrl+Shift+S (Cmd+Shift+S on Mac)
- Click "Open Sidebar" in the popup
- Refresh the page if needed

**Performance issues:**

- Clear logs if you have many captured requests
- Restart the browser if experiencing slowdowns
- Check for other extensions that might conflict

## Development

### Project Structure

```
Senator/
├── manifest.json          # Extension configuration
├── background.js          # Service worker for request interception
├── popup.html            # Popup interface
├── popup.js              # Popup functionality
├── content.js            # Content script for sidebar
├── icons/                # Extension icons
└── README.md             # This file
```

### Building for Production

1. Create icon files (16x16, 48x48, 128x128) in the `icons/` directory
2. Update version in `manifest.json`
3. Zip the entire directory
4. Submit to Chrome Web Store

### Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Test thoroughly
5. Submit a pull request

## License

This project is licensed under the MIT License - see the LICENSE file for details.

## Support

For issues, questions, or feature requests:

- Create an issue on GitHub
- Check the troubleshooting section above
- Review the Chrome extension documentation

## Changelog

### v1.0.0

- Initial release
- Network request interception
- OpenAI AI analysis integration
- Popup and sidebar interfaces
- Export and data management features
- Keyboard shortcuts and badge counters
