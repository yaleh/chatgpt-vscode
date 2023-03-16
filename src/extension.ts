import * as vscode from 'vscode';
import { ChatGPTAPI, ChatGPTUnofficialProxyAPI } from 'chatgpt';

import * as path from 'path';
import * as fs from 'fs';
import * as cheerio from 'cheerio';
import {parse} from "csv";
import fetch from 'node-fetch';

type AuthInfo = {
	mode?: string,
	apiKey?: string,
	accessToken?: string,
	proxyUrl?: string
};
type Settings = {selectedInsideCodeblock?: boolean, codeblockWithLanguageId?: boolean, keepConversation?: boolean, timeoutLength?: number};
type WorkingState = 'idle' | 'asking';

export function activate(context: vscode.ExtensionContext) {

	console.log('activating extension "chatgpt"');
	// Get the settings from the extension's configuration
	const config = vscode.workspace.getConfiguration('chatgpt-ai');

	// Create a new ChatGPTViewProvider instance and register it with the extension's context
	const provider = new ChatGPTViewProvider(context.extensionPath, context.extensionUri);

	// Put configuration settings into the provider
	provider.setAuthenticationInfo({
		mode: config.get('mode'),
		apiKey: config.get('apiKey'),
		accessToken: config.get('accessToken'),
		proxyUrl: config.get('proxyUrl') === "Custom" ? config.get('customProxyUrl') : config.get('proxyUrl')
	});
	provider.setSettings({
		selectedInsideCodeblock: config.get('selectedInsideCodeblock') || false,
		codeblockWithLanguageId: config.get('codeblockWithLanguageId') || false,
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
		const config = vscode.workspace.getConfiguration('chatgpt-ai');
		const prompt = config.get(command) as string;
		provider.searchSelection(prompt);
	};

	// Register the commands that can be called from the extension's package.json
	context.subscriptions.push(
		vscode.commands.registerCommand('chatgpt-ai.ask', () =>
			vscode.window.showInputBox({ prompt: 'What do you want to do?' })
				.then((value) => {
					if (value !== undefined && value !== null) {
						provider.searchSelection(value);
					}
				})
		),
		vscode.commands.registerCommand('chatgpt-ai.explain', () => commandHandler('promptPrefix.explain')),
		vscode.commands.registerCommand('chatgpt-ai.refactor', () => commandHandler('promptPrefix.refactor')),
		vscode.commands.registerCommand('chatgpt-ai.optimize', () => commandHandler('promptPrefix.optimize')),
		vscode.commands.registerCommand('chatgpt-ai.findProblems', () => commandHandler('promptPrefix.findProblems')),
		vscode.commands.registerCommand('chatgpt-ai.documentation', () => commandHandler('promptPrefix.documentation')),
		vscode.commands.registerCommand('chatgpt-ai.complete', () => commandHandler('promptPrefix.complete')),
		vscode.commands.registerCommand('chatgpt-ai.resetConversation', () => provider.resetConversation())
	);

	// Change the extension's session token or settings when configuration is changed
	vscode.workspace.onDidChangeConfiguration((event: vscode.ConfigurationChangeEvent) => {
		if (
			event.affectsConfiguration('chatgpt-ai.mode') ||
			event.affectsConfiguration('chatgpt-ai.apiKey') ||
			event.affectsConfiguration('chatgpt-ai.accessToken') ||
			event.affectsConfiguration('chatgpt-ai.proxyUrl')
		) {
			const config = vscode.workspace.getConfiguration('chatgpt-ai');
			provider.setAuthenticationInfo({
				mode: config.get('mode'),
				apiKey: config.get('apiKey'),
				accessToken: config.get('accessToken'),
				proxyUrl: config.get('proxyUrl') === "Custom" ? config.get('customProxyUrl') : config.get('proxyUrl')
			});

			// clear conversation
			provider.resetConversation();
		} else if (event.affectsConfiguration('chatgpt-ai.selectedInsideCodeblock')) {
			const config = vscode.workspace.getConfiguration('chatgpt-ai');
			provider.setSettings({ selectedInsideCodeblock: config.get('selectedInsideCodeblock') || false });
		} else if (event.affectsConfiguration('chatgpt-ai.codeblockWithLanguageId')) {
			const config = vscode.workspace.getConfiguration('chatgpt-ai');
			provider.setSettings({ codeblockWithLanguageId: config.get('codeblockWithLanguageId') || false });
		} else if (event.affectsConfiguration('chatgpt-ai.keepConversation')) {
			const config = vscode.workspace.getConfiguration('chatgpt-ai');
			provider.setSettings({ keepConversation: config.get('keepConversation') || false });
		} else if (event.affectsConfiguration('chatgpt-ai.timeoutLength')) {
			const config = vscode.workspace.getConfiguration('chatgpt-ai');
			provider.setSettings({ timeoutLength: config.get('timeoutLength') || 60 });
		}
	});
}





class ChatGPTViewProvider implements vscode.WebviewViewProvider {
	public static readonly viewType = 'chatgpt-ai.chatView';
	private _view?: vscode.WebviewView;

	private _chatGPTAPI?: ChatGPTAPI | ChatGPTUnofficialProxyAPI;
	private _conversation?: any;

	// An AbortController for _chatGPTAPI
	private _abortController = new AbortController();

	private _response?: string;
	private _prompt?: string;
	private _fullPrompt?: string;
	private _currentMessageNumber = 0;

	private _workingState: WorkingState;

	private _settings: Settings = {
		selectedInsideCodeblock: false,
		codeblockWithLanguageId: false,
		keepConversation: true,
		timeoutLength: 60
	};
	private _authInfo?: AuthInfo;

	// In the constructor, we store the URI of the extension
	constructor(private readonly _extensionPath: string, private readonly _extensionUri: vscode.Uri) {
		this._workingState = 'idle';
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

	private _setWorkingState(mode: WorkingState) {
		this._workingState = mode;
		this._view?.webview.postMessage({ type: 'setWorkingState', value: this._workingState});
	}

	// This private method initializes a new ChatGPTAPI instance
	private _newAPI() {
		// console.log("New API");

		this._conversation = null;
		this._currentMessageNumber = 0;

		if (!this._authInfo) {
			console.warn("Invalid auth info, please set working mode and related auth info.");
			return;
		}
		if (this._authInfo?.mode === "ChatGPTAPI") {
			if (!this._authInfo?.apiKey) {
				console.warn("API key not set, please go to extension settings (read README.md for more info)");
			}else{
				this._chatGPTAPI = new ChatGPTAPI({
					apiKey: this._authInfo.apiKey,
					debug: false
				});
			}
		} else if (this._authInfo?.mode === "ChatGPTUnofficialProxyAPI") {
			if (!this._authInfo?.accessToken) {
				console.warn("Access token not set, please go to extension settings (read README.md for more info)");
			}else if (!this._authInfo?.proxyUrl) {
				console.warn("Proxy URL not set, please go to extension settings (read README.md for more info)");
			}else{
				this._chatGPTAPI = new ChatGPTUnofficialProxyAPI({
					accessToken: this._authInfo.accessToken,
					apiReverseProxyUrl: this._authInfo.proxyUrl,
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
				case 'webviewLoaded':
					{
						this._view?.webview.postMessage({ type: 'setWorkingState', value: this._workingState });
						// this.loadAwesomePrompts();
						break;
					}
				case 'loadPrompts':
					{
						// force prompts updating
						// this.loadAwesomePrompts();
						break;
					}
				case 'codeSelected':
					{
						let code = data.value;
						const snippet = new vscode.SnippetString();
						snippet.appendText(code);
						// insert the code as a snippet into the active text editor
						vscode.window.activeTextEditor?.insertSnippet(snippet);
						break;
					}
				// case 'promptUpdated':
				// 	{
				// 		// find prompt suggestions with searchPrompts()
				// 		// and send them back to webview with message "showSuggestion" 
				// 		const userInput = data.value as string;
				// 		this.searchPrompts(userInput).then(prompts => {
				// 			this._view?.webview.postMessage({ type: 'showSuggestions', value: prompts });
				// 		}).catch(err => console.error(err));
				// 		break;
				// 	}
				case 'sendPrompt':
					{
						this.searchSelection(data.value);
						break;
					}
				case 'abort':
					{
						this.abort();
						break;
					}
				case 'resetConversation':
					{
						this.resetConversation();
						break;
					}
			}
		});
	}

	private _prompts: String[] = [];

	private loadAwesomePrompts(){
		// Fetch https://raw.githubusercontent.com/f/awesome-chatgpt-prompts/main/prompts.csv
		fetch('https://raw.githubusercontent.com/f/awesome-chatgpt-prompts/main/prompts.csv')
			.then(response => response.text())
			.then(csv => {
				parse(csv, { columns: true, relax_quotes: true, ltrim: true, rtrim: true }, (err, output) => {
					const prompts = output.map((row: any) => row['prompt']);
					this._view?.webview.postMessage({type: 'promptsLoaded', value: prompts});
				});
			});
	}

	/**
 	 * Search for matched prompts in the prompts.csv file
 	 */
	private async searchPrompts(userInput: string): Promise<string[]> {
		// If the prompts haven't been loaded yet, fetch them from GitHub
		if (this._prompts?.length === 0) {
			const response = await fetch('https://raw.githubusercontent.com/f/awesome-chatgpt-prompts/main/prompts.csv');
			const data = await response.text();
			// Parse the CSV data and store it in the prompts array with npm csv
			parse(data, { columns: true, relax_quotes: true, ltrim: true, rtrim: true }, (err, output) => {
				this._prompts = output.map((row: any) => row.prompt);
			});
		}

		const matchedPrompts: string[] = [];
		// Search the prompts array for matches based on the user input
		this._prompts.forEach(prompt => {
			if (typeof prompt === 'string' && prompt.toLowerCase().includes(userInput.toLowerCase())) {
				matchedPrompts.push(prompt as string);
			}
		});
	
		return matchedPrompts;
	}

	public async resetConversation() {
		if (this._workingState === 'idle') {
			if (this._conversation) {
				this._conversation = null;
			}
			this._currentMessageNumber = 0;
			this._prompt = '';
			this._response = '';
			this._fullPrompt = '';
			this._view?.webview.postMessage({ type: 'setPrompt', value: '' });
			this._view?.webview.postMessage({ type: 'clearResponses', value: '' });
			this._view?.webview.postMessage({ type: 'setConversationId', value: ''});
		} else {
			console.warn('Conversation is not in idle state. Resetting conversation is not allowed.');
		}
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
			await vscode.commands.executeCommand('chatgpt-ai.chatView.focus');
		} else {
			this._view?.show?.(true);
		}
		
		let response = '';
		this._response = '';
		// Get the selected text of the active editor
		const selection = vscode.window.activeTextEditor?.selection;
		const selectedText = vscode.window.activeTextEditor?.document.getText(selection);
		// Get the language id of the selected text of the active editor
		// If a user does not want to append this information to their prompt, leave it as an empty string
		const languageId = (this._settings.codeblockWithLanguageId ? vscode.window.activeTextEditor?.document?.languageId : undefined) || "";
		let searchPrompt = '';

		if (selection && selectedText) {
			// If there is a selection, add the prompt and the selected text to the search prompt
			if (this._settings.selectedInsideCodeblock) {
				searchPrompt = `${prompt}\n\`\`\`${languageId}\n${selectedText}\n\`\`\``;
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

	private async sendMessageAndGetResponse(searchPrompt: string) {
		this._view?.show?.(true);

		if (!this._chatGPTAPI) {
			this._view?.webview.postMessage({type: 'addEvent', value: {text: '[ERROR] "API key not set or wrong, please go to extension settings to set it (read README.md for more info)"'}});			
		} else {
			// If successfully signed in
			// console.log("sendMessage");

			// Make sure the prompt is shown
			this._view?.webview.postMessage({ type: 'setPrompt', value: this._prompt });

			// Increment the message number
			this._currentMessageNumber++;

			this._setWorkingState('asking');

			try {
				// Send the search prompt to the ChatGPTAPI instance and store the response
				let currentMessageNumber = this._currentMessageNumber;
				const res = await this._chatGPTAPI.sendMessage(searchPrompt, {
					onProgress: (partialResponse) => {
						if (partialResponse.id === partialResponse.parentMessageId) {
							// A bug of ChatGPT JS lib. It's the first user request.
							return;
						}

						// If the message number has changed, don't show the partial response
						if (this._currentMessageNumber !== currentMessageNumber) {
							return;
						}
						
						// console.log("onProgress");
						if (this._view && this._view.visible) {
							// response = partialResponse.text;
							this._view.webview.postMessage({ type: 'addResponse', value: partialResponse });
						}
					},
					timeoutMs: (this._settings.timeoutLength || 60) * 1000,
					abortSignal: this._abortController.signal,
					...this._conversation
				});

				if (this._currentMessageNumber !== currentMessageNumber) {
					return '';
				}

				if (this._settings.keepConversation){
					this._conversation = {
						conversationId: res.conversationId,
						parentMessageId: res.id
					};
					this._view?.webview?.postMessage({type: 'setConversationId', value: res.parentMessageId});
				}
			} catch (e) {

				console.error(e);
				// response += `\n\n---\n[ERROR] ${e}`;
				this._view?.show?.(true);
				this._view?.webview.postMessage({type: 'addEvent', value: {text: `\n\n---\n[ERROR] ${e}`}});
			}
		}

		// Show the view and send a message to the webview with the response
		// if (this._view) {
		// 	this._view.show?.(true);
		// 	// this._view.webview.postMessage({ type: 'addResponse', value: response });
		// }

		this._setWorkingState("idle");
	}

	public abort(){
		this._abortController?.abort();
		this._setWorkingState("idle");

		// reset the controller
		this._abortController = new AbortController();
	}

	private _getHtmlForWebview(webview: vscode.Webview) {
		const indexHtmlPath = path.join(this._extensionPath, 'media', 'html', 'index.html');
		const indexHtml = fs.readFileSync(indexHtmlPath, 'utf8');
		
		const $ = cheerio.load(indexHtml);
		$('#responses').empty();
		
		const scriptUri = webview.asWebviewUri((vscode.Uri as any).joinPath(this._extensionUri, 'dist', 'main.js'));
		const tailwindUri = webview.asWebviewUri((vscode.Uri as any).joinPath(this._extensionUri, 'media', 'scripts', 'tailwind.min.js'));
		const highlightcssUri = webview.asWebviewUri((vscode.Uri as any).joinPath(this._extensionUri, 'media', 'styles', 'highlight-vscode.min.css'));
		const jqueryuicssUri = webview.asWebviewUri((vscode.Uri as any).joinPath(this._extensionUri, 'media', 'styles', 'jquery-ui.css'));

		return $.html()
			.replace('{{tailwindUri}}', tailwindUri.toString())
			.replace('{{highlightcssUri}}', highlightcssUri.toString())
			.replace('{{jqueryuicssUri}}', jqueryuicssUri.toString())
			.replace('{{scriptUri}}', scriptUri.toString());
	}
}

// This method is called when your extension is deactivated
export function deactivate() {}