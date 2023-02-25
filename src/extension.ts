import * as vscode from 'vscode';
import { ChatGPTAPI, ChatGPTUnofficialProxyAPI } from 'chatgpt';

import * as path from 'path';
import * as fs from 'fs';
import * as cheerio from 'cheerio';

type AuthInfo = {
	mode?: string,
	apiKey?: string,
	accessToken?: string
};
type Settings = {selectedInsideCodeblock?: boolean, pasteOnClick?: boolean, keepConversation?: boolean, timeoutLength?: number};


export function activate(context: vscode.ExtensionContext) {

	console.log('activating extension "chatgpt"');
	// Get the settings from the extension's configuration
	const config = vscode.workspace.getConfiguration('chatgpt');

	// Create a new ChatGPTViewProvider instance and register it with the extension's context
	const provider = new ChatGPTViewProvider(context.extensionPath, context.extensionUri);

	// Put configuration settings into the provider
	provider.setAuthenticationInfo({
		mode: config.get('mode'),
		apiKey: config.get('apiKey'),
		accessToken: config.get('accessToken')
	});
	provider.setSettings({
		selectedInsideCodeblock: config.get('selectedInsideCodeblock') || false,
		pasteOnClick: config.get('pasteOnClick') || false,
		keepConversation: config.get('keepConversation') || false,
		timeoutLength: config.get('timeoutLength') || 60,
	});

	// Register the provider with the extension's context
	context.subscriptions.push(
		vscode.window.registerWebviewViewProvider(ChatGPTViewProvider.viewType, provider,  {
			webviewOptions: { retainContextWhenHidden: true }
		})
	);


	const commandHandler = (command:string) => {
		const config = vscode.workspace.getConfiguration('chatgpt');
		const prompt = config.get(command) as string;
		provider.searchSelection(prompt);
	};

	// Register the commands that can be called from the extension's package.json
	context.subscriptions.push(
		vscode.commands.registerCommand('chatgpt.ask', () =>
			vscode.window.showInputBox({ prompt: 'What do you want to do?' })
				.then((value) => {
					if (value !== undefined && value !== null) {
						provider.searchSelection(value);
					}
				})
		),
		vscode.commands.registerCommand('chatgpt.explain', () => commandHandler('promptPrefix.explain')),
		vscode.commands.registerCommand('chatgpt.refactor', () => commandHandler('promptPrefix.refactor')),
		vscode.commands.registerCommand('chatgpt.optimize', () => commandHandler('promptPrefix.optimize')),
		vscode.commands.registerCommand('chatgpt.findProblems', () => commandHandler('promptPrefix.findProblems')),
		vscode.commands.registerCommand('chatgpt.documentation', () => commandHandler('promptPrefix.documentation')),
		vscode.commands.registerCommand('chatgpt.complete', () => commandHandler('promptPrefix.complete')),
		vscode.commands.registerCommand('chatgpt.resetConversation', () => provider.resetConversation())
	);

	// Change the extension's session token or settings when configuration is changed
	vscode.workspace.onDidChangeConfiguration((event: vscode.ConfigurationChangeEvent) => {
		if (
			event.affectsConfiguration('chatgpt.mode') ||
			event.affectsConfiguration('chatgpt.apiKey') ||
			event.affectsConfiguration('chatgpt.accessToken')
		) {
			const config = vscode.workspace.getConfiguration('chatgpt');
			provider.setAuthenticationInfo({
				mode: config.get('mode'),
				apiKey: config.get('apiKey'),
				accessToken: config.get('accessToken')
			});
		} else if (event.affectsConfiguration('chatgpt.selectedInsideCodeblock')) {
			const config = vscode.workspace.getConfiguration('chatgpt');
			provider.setSettings({ selectedInsideCodeblock: config.get('selectedInsideCodeblock') || false });
		} else if (event.affectsConfiguration('chatgpt.pasteOnClick')) {
			const config = vscode.workspace.getConfiguration('chatgpt');
			provider.setSettings({ pasteOnClick: config.get('pasteOnClick') || false });
		} else if (event.affectsConfiguration('chatgpt.keepConversation')) {
			const config = vscode.workspace.getConfiguration('chatgpt');
			provider.setSettings({ keepConversation: config.get('keepConversation') || false });
		} else if (event.affectsConfiguration('chatgpt.timeoutLength')) {
			const config = vscode.workspace.getConfiguration('chatgpt');
			provider.setSettings({ timeoutLength: config.get('timeoutLength') || 60 });
		}
	});
}





class ChatGPTViewProvider implements vscode.WebviewViewProvider {
	public static readonly viewType = 'chatgpt.chatView';
	private _view?: vscode.WebviewView;

	private _chatGPTAPI?: ChatGPTAPI | ChatGPTUnofficialProxyAPI;
	private _conversation?: any;

	// An AbortController for _chatGPTAPI
	private _abortController = new AbortController();

	private _response?: string;
	private _prompt?: string;
	private _fullPrompt?: string;
	private _currentMessageNumber = 0;

	private _settings: Settings = {
		selectedInsideCodeblock: false,
		pasteOnClick: true,
		keepConversation: true,
		timeoutLength: 60
	};
	private _authInfo?: AuthInfo;

	// In the constructor, we store the URI of the extension
	constructor(private readonly _extensionPath: string, private readonly _extensionUri: vscode.Uri) {

	}
	
	// Set the API key and create a new API instance based on this key
	public setAuthenticationInfo(authInfo: AuthInfo) {
		this._authInfo = authInfo;
		this._newAPI();
	}

	public setSettings(settings: Settings) {
		this._settings = {...this._settings, ...settings};
	}

	public getSettings() {
		return this._settings;
	}

	// This private method initializes a new ChatGPTAPI instance
	private _newAPI() {
		console.log("New API");

		if (!this._authInfo) {
			console.warn("Invalid auth info, please set working mode and related auth info.");
			return;
		}
		if (this._authInfo?.mode === "ChatGPTAPI") {
			if (!this._authInfo?.apiKey) {
				console.warn("API key not set, please go to extension settings (read README.md for more info)");
			}else{
				this._chatGPTAPI = new ChatGPTAPI({
					apiKey: this._authInfo.apiKey
				});
			}
		} else if (this._authInfo?.mode === "ChatGPTUnofficialProxyAPI") {
			if (!this._authInfo?.accessToken) {
				console.warn("Access token not set, please go to extension settings (read README.md for more info)");
			}else{
				this._chatGPTAPI = new ChatGPTUnofficialProxyAPI({
					accessToken: this._authInfo.accessToken,
					debug: false
				});
			}			
		}

	}

	public resolveWebviewView(
		webviewView: vscode.WebviewView,
		context: vscode.WebviewViewResolveContext,
		_token: vscode.CancellationToken,
	) {
		this._view = webviewView;

		// set options for the webview, allow scripts
		webviewView.webview.options = {
			enableScripts: true,
			localResourceRoots: [
				this._extensionUri
			]
		};

		// set the HTML for the webview
		webviewView.webview.html = this._getHtmlForWebview(webviewView.webview);

		// add an event listener for messages received by the webview
		webviewView.webview.onDidReceiveMessage(data => {
			switch (data.type) {
				case 'codeSelected':
					{
						// do nothing if the pasteOnClick option is disabled
						if (!this._settings.pasteOnClick) {
							break;
						}
						let code = data.value;
						const snippet = new vscode.SnippetString();
						snippet.appendText(code);
						// insert the code as a snippet into the active text editor
						vscode.window.activeTextEditor?.insertSnippet(snippet);
						break;
					}
				case 'prompt':
					{
						this.searchSelection(data.value);
					}
				case 'abort':
					{
						this.abort();
					}
			}
		});
	}


	public async resetConversation() {
		console.log(this, this._conversation);
		if (this._conversation) {
			this._conversation = null;
		}
		this._prompt = '';
		this._response = '';
		this._fullPrompt = '';
		this._view?.webview.postMessage({ type: 'setPrompt', value: '' });
		this._view?.webview.postMessage({ type: 'addResponse', value: '' });
	}


	public async searchSelection(prompt?:string) {
		this._prompt = prompt;
		if (!prompt) {
			prompt = '';
		};

		// Check if the ChatGPTAPI instance is defined
		if (!this._chatGPTAPI) {
			this._newAPI();
		}

		// focus gpt activity from activity bar
		if (!this._view) {
			await vscode.commands.executeCommand('chatgpt.chatView.focus');
		} else {
			this._view?.show?.(true);
		}
		
		let response = '';
		this._response = '';
		// Get the selected text of the active editor
		const selection = vscode.window.activeTextEditor?.selection;
		const selectedText = vscode.window.activeTextEditor?.document.getText(selection);
		let searchPrompt = '';

		if (selection && selectedText) {
			// If there is a selection, add the prompt and the selected text to the search prompt
			if (this._settings.selectedInsideCodeblock) {
				searchPrompt = `${prompt}\n\`\`\`\n${selectedText}\n\`\`\``;
			} else {
				searchPrompt = `${prompt}\n${selectedText}\n`;
			}
		} else {
			// Otherwise, just use the prompt if user typed it
			searchPrompt = prompt;
		}
		this._fullPrompt = searchPrompt;

		this.sendMessageAndGetResponse(searchPrompt);
	}

	private async sendMessageAndGetResponse(searchPrompt: string): Promise<string> {
		let response = '';
		if (!this._chatGPTAPI) {
			response = '[ERROR] "API key not set or wrong, please go to extension settings to set it (read README.md for more info)"';
		} else {
			// If successfully signed in
			console.log("sendMessage");

			// Make sure the prompt is shown
			this._view?.webview.postMessage({ type: 'setPrompt', value: this._prompt });
			this._view?.webview.postMessage({ type: 'addResponse', value: '...' });

			// Increment the message number
			this._currentMessageNumber++;

			const agent = this._chatGPTAPI;

			this._view?.webview.postMessage({ type: 'setDisplayingMode', value: 'asking'});

			try {
				// Send the search prompt to the ChatGPTAPI instance and store the response
				let currentMessageNumber = this._currentMessageNumber;
				const res = await agent.sendMessage(searchPrompt, {
					onProgress: (partialResponse) => {
						// If the message number has changed, don't show the partial response
						if (this._currentMessageNumber !== currentMessageNumber) {
							return;
						}
						console.log("onProgress");
						if (this._view && this._view.visible) {
							response = partialResponse.text;
							this._view.webview.postMessage({ type: 'addResponse', value: partialResponse.text });
						}
					},
					timeoutMs: (this._settings.timeoutLength || 60) * 1000,
					abortSignal: this._abortController.signal,
					...this._conversation
				});

				this._view?.webview.postMessage({ type: 'setDisplayingMode', value: 'idle'});

				if (this._currentMessageNumber !== currentMessageNumber) {
					return '';
				}

				response = res.text;
				if (this._settings.keepConversation){
					this._conversation = {
						conversationId: res.conversationId,
						parentMessageId: res.id
					};
				}
			} catch (e) {
				this._view?.webview.postMessage({ type: 'setDisplayingMode', value: 'idle'});

				console.error(e);
				response += `\n\n---\n[ERROR] ${e}`;
			}
		}

		// Saves the response
		this._response = response;

		// Show the view and send a message to the webview with the response
		if (this._view) {
			this._view.show?.(true);
			this._view.webview.postMessage({ type: 'addResponse', value: response });
		}

		return response;
	}

	public abort(){
		this._view?.webview.postMessage({ type: 'setDisplayingMode', value: 'idle'});

		this._abortController?.abort();
		// reset the controller
		this._abortController = new AbortController();
	}

	private _getHtmlForWebview(webview: vscode.Webview) {
		const indexHtmlPath = path.join(this._extensionPath, 'media', 'html', 'index.html');
		const indexHtml = fs.readFileSync(indexHtmlPath, 'utf8');
		
		const $ = cheerio.load(indexHtml);
		$('#responses').empty();
		
		const scriptUri = webview.asWebviewUri((vscode.Uri as any).joinPath(this._extensionUri, 'media', 'main.js'));
		// const microlightUri = webview.asWebviewUri((vscode.Uri as any).joinPath(this._extensionUri, 'media', 'scripts', 'microlight.min.js'));
		const tailwindUri = webview.asWebviewUri((vscode.Uri as any).joinPath(this._extensionUri, 'media', 'scripts', 'tailwind.min.js'));
		// const showdownUri = webview.asWebviewUri((vscode.Uri as any).joinPath(this._extensionUri, 'media', 'scripts', 'showdown.min.js'));
		const markedUri = webview.asWebviewUri((vscode.Uri as any).joinPath(this._extensionUri, 'media', 'scripts', 'marked.min.js'));
		const highlightUri = webview.asWebviewUri((vscode.Uri as any).joinPath(this._extensionUri, 'media', 'scripts', 'highlight.min.js'));
		const highlightcssUri = webview.asWebviewUri((vscode.Uri as any).joinPath(this._extensionUri, 'media', 'styles', 'highlight-vscode.min.css'));

		return $.html()
			.replace('{{tailwindUri}}', tailwindUri.toString())
			// .replace('{{showdownUri}}', showdownUri.toString())
			// .replace('{{microlightUri}}', microlightUri.toString())
			.replace('{{markedUri}}', markedUri.toString())
			.replace('{{highlightUri}}', highlightUri.toString())
			.replace('{{highlightcssUri}}', highlightcssUri.toString())
			.replace('{{scriptUri}}', scriptUri.toString());
	}
}

// This method is called when your extension is deactivated
export function deactivate() {}