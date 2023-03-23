# ChatGPT AI for VSCode

![Visual Studio Marketplace Version](https://img.shields.io/visual-studio-marketplace/v/YaleHuang.chatgpt-ai?color=orange&label=VS%20Code%20Marketplace)
![Visual Studio Marketplace Downloads](https://img.shields.io/visual-studio-marketplace/d/YaleHuang.chatgpt-ai?color=blueviolet&label=Downloads)
![Github stars](https://img.shields.io/github/stars/yaleh/chatgpt-vscode?color=blue&label=Github%20Stars)

<img src="examples/copilot.jpg" alt="Refactoring selected code using chatGPT"/>

ChatGPT AI Extension integrates OpenAI's GPT-4, GPT-3.5, GPT-3 and Codex models into Visual Studio Code, providing AI-powered assistance for writing new code, asking questions, finding bugs, refactoring code, and more.


### Links:

- **[Github Repository](https://github.com/yaleh/chatgpt-vscode)**
- **[Visual Studio Code Marketplace](https://marketplace.visualstudio.com/items?itemName=YaleHuang.chatgpt-ai)**

<br>

<img src="examples/main.png" alt="Refactoring selected code using chatGPT"/>

## Features
- 💡 **Ask general questions** or use code snippets from the editor to query ChatGPT via an input box in the sidebar.
- 💬 **View chat history** with requests and responses.
  - Toggle the display of requests and responses between rendered Markdown and raw text.
  - 📝 **Insert code snippets** from the AI's response into the active editor with corrected indentation.
  - 📋 **Copy code snippets** to the clipboard.
- 📚 **Multiple types of context** available:
  - ❌ No context.
  - 📝 Selected text.
  - 📂 Whole file.
  - 📂🔍 All opened files.
- 🖱️ Right-click on a code selection and run one of the context menu **shortcuts** for your code:
  - 📖 Automatically generate documentation.
  - 🤔 Explain the selected code.
  - ♻️ Refactor or optimize the code.
  - 🐛 Find problems with the code.
  - 💻 Complete the code according to the comments.
- 🚀 See the response as it is being generated **in real time**.
- 💬 Ask **follow-up questions** to the response and maintain conversation context.

## Requirements
To use ChatGPT AI, please ensure that the following requirements are met:

* Visual Studio Code version 1.73.0 or later is installed on your system.
* You have an OpenAI API key or ChatGPT access token.

## Installation

To use this extension, install it from the VSCode marketplace.

1. After the installation is complete, you will need to add your OpenAI API key to the extension settings in VSCode. To do this, open the `Settings` panel by going to the `File` menu and selecting `Preferences`, then `Settings`.
2. In the search bar, type `ChatGPT` to filter the settings list.
3. In the ChatGPT section, enter your API key in the top field

After completing these steps, the extension should be ready to use.

## API Modes

Currently, there are two modes for accessing the API: "ChatGPTAPI" and "ChatGPTUnofficialProxyAPI".
### ChatGPTAPI

To use this extension, you will need an `API key` from OpenAI. To obtain one, follow these steps:

1. Go to [OpenAI's website](https://platform.openai.com/account/api-keys). If you don't have an account, you will need to create one or sign up using your Google or Microsoft account.
2. Click on the `Create new secret key` button.
3. Copy the key and paste it into the `API Key` field in the extension settings.

### ChatGPTUnofficialProxyAPI

To use the ChatGPTUnofficialProxyAPI, you need an OpenAI access token from the ChatGPT web app. You can obtain the access token in either of two ways:

* Use [acheong08/OpenAIAuth](https://github.com/acheong08/OpenAIAuth), which is a Python script to automatically log in and get an access token. This method works only with email and password accounts; it does not support accounts where you authenticate via Microsoft or Google.
* Manually get an access token by logging in to the ChatGPT web app and opening https://chat.openai.com/api/auth/session, which will return a JSON object containing your access token string.

Access tokens last for approximately eight hours.

## Building from source (not applicable for VSCode marketplace version)

To build the extension from source, clone the repository and run `npm install` to install the dependencies. You have to change some code in `chatgpt` module because VSCode runtime does not support `fetch`. Open `node_modules/chatgpt/dist/index.js` and add the following code at the top of the file:

```js
import fetch from 'node-fetch';
```

Then remove the following lines (around line 15):

```js
// src/fetch.ts
var fetch = globalThis.fetch;
if (typeof fetch !== "function") {
  throw new Error("Invalid environment: global fetch not defined");
}
```

You also need to copy `encoder.json` and `vocab.bpe` from `node_modules/gpt-3-encoder/` into `dist/` folder. You can do this by running the following commands:

```bash
cp node_modules/gpt-3-encoder/{encoder.json,vocab.bpe} dist/
```

## Using the Extension

To use the extension, open a text editor in Visual Studio Code and open the ChatGPT panel by clicking on the ChatGPT icon in the sidebar. This will open a panel with an input field where you can enter your prompt or question. By clicking enter, it will be sent to ChatGPT. Its response will be displayed below the input field in the sidebar (note that it may take some time for it to be calculated).

<img src="examples/create.png" alt="Writing new code using chatGPT" width="500"/>

You can also select a code snippet in the editor and then enter a prompt in the side panel, or right-click and select "Ask ChatGPT". The **selected code will be automatically appended** to your query when it is sent to the AI. This can be useful for generating code snippets or getting explanations for specific pieces of code.

<img src="examples/explain.png" alt="Refactoring selected code using chatGPT"/>

To **insert a code snippet** from the AI's response into the editor, simply click on the code block in the panel. The code will be automatically inserted at the cursor position in the active editor.

<img src="examples/refactor.png" alt="chatGPT explaining selected code"/>

You can select some code in the editor, right click on it and choose one of the following **shortcuts** from the context menu:
#### Commands

The following commands are available:

* Ask ChatGPT: This command will provide a prompt for you to enter any query.
* ChatGPT: Explain selection: This command will explain what the selected code does.
* ChatGPT: Refactor selection: This command will attempt to refactor the selected code.
* ChatGPT: Find problems: This command will look for problems/errors in the selected code, fix them, and provide an explanation.
* ChatGPT: Optimize selection: This command will attempt to optimize the selected code.
* ChatGPT: Complete code: This command will complete the code according to the last comments of the selection.

`Ask ChatGPT` is also available when nothing is selected. For the other four commands, you can **customize the exact prompt** that will be sent to the AI by editing the extension settings in VSCode Preferences.


Because ChatGPT is a conversational AI, you can ask follow-up questions to the response. The conversation context is maintained between queries, so you can ask multiple questions in a row. 
To **reset the conversation context**, click `ctrl+shift+p` and select `ChatGPT: Reset Conversation`.

## License

ChatGPT AI is licensed under the MIT License. See the LICENSE file for more information.

## Credits

- This wouldn't be possible without OpenAI's [ChatGPT](https://chat.openai.com/chat)
- The extension makes use of [chatgpt-api](https://github.com/transitive-bullshit/chatgpt-api) (by [Travis Fischer](https://github.com/transitive-bullshit)), which uses unofficial ChatGPT API in order to login and communicate with it.
- The project was started by [mpociot](https://github.com/mpociot/) and [timkmecl](https://github.com/timkmecl)
- `v0.3` inspired by [barnesoir/chatgpt-vscode-plugin](https://github.com/barnesoir/chatgpt-vscode-plugin) and [gencay/vscode-chatgpt](https://github.com/gencay/vscode-chatgpt)