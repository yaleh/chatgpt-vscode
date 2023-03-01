// @ts-ignore 

import * as marked from 'marked';
import hljs from 'highlight.js';

declare const acquireVsCodeApi: () => any;

interface ChatResponse {
  id: string;
  text: string;
  parentMessageId?: string;
  conversationId?: string;
}

interface ChatRequest {
  id?: string;
  text: string;
  parentMessageId?: string;
  conversationId?: string;
}

interface ChatEvent {
  text: string;
}

// This script will be run within the webview itself
// It cannot access the main VS Code APIs directly.
(function () {
  const vscode = acquireVsCodeApi();

  let response = '';
  let workingState = 'idle';

  // Handle messages sent from the extension to the webview
  window.addEventListener("message", (event: MessageEvent) => {
    const message = event.data;
    switch (message.type) {
      case "addResponse": {
        // const chatResponse: ChatResponse = message.value;
        // response = message.value;
        updateResponse(message.value as ChatResponse);
        break;
      }
      case "addReqeust": {
        updateRequest(message.values as ChatRequest);
        break;
      }
      case "addEvent": {
        updateEvent(message.values as ChatEvent);
        break;
      }
      case "clearResponses": {
        clearResponses();
        break;
      }
      case "setPrompt": {
        const promptInput = document.getElementById("prompt-input") as HTMLInputElement;
        promptInput.value = message.value;
        break;
      }
      case "setWorkingState": {
        setWorkingState(message.value);
        break;
      }
      case "setConversationId": {
        updateConversationId(message.value);
        break;
      }
    }
  });

  function updateConversationId(id: string) {
    const conversationId = id || "/";
    const conversationIdText = `Conversation ID: ${conversationId}`;
    const conversationIdElement = document.getElementById("conversation-id") as HTMLDivElement;
    conversationIdElement.innerText = conversationIdText;
  }

  function fixCodeBlocks(response: string) {
    const REGEX_CODEBLOCK = new RegExp('\`\`\`', 'g');
    const matches = response.match(REGEX_CODEBLOCK);

    const count = matches ? matches.length : 0;
    if (count % 2 === 0) {
      return response;
    } else {
      return response.concat('\n\`\`\`');
    }
  }

  let lastResponse: ChatResponse | null = null;

  function updateResponse(response: ChatResponse){
    const responsesDiv = document.getElementById("responses") as HTMLDivElement;
    let updatedResponseDiv: HTMLElement | null = null;

    if (responsesDiv.childElementCount > 0 && responsesDiv.lastChild !== null && (response.id === null || response?.id === lastResponse?.id)) {
      // Update the existing response
      updatedResponseDiv = responsesDiv.lastChild as HTMLElement;
    } else {
      // Create a new div and append it to the "response" div
      const newDiv = document.createElement('div');
      newDiv.classList.add('response');
      responsesDiv.appendChild(newDiv);
      updatedResponseDiv = newDiv;
    }

    updateResponseDiv(updatedResponseDiv, response);
    lastResponse = response;
  }

  function updateResponseDiv(div: HTMLElement, response: ChatResponse) {
    const markedOptions: marked.MarkedOptions = {
      renderer: new marked.Renderer(),
      highlight: (code: string, lang: string) => {
        return hljs.highlightAuto(code).value;
      },
      langPrefix: 'hljs language-',
      pedantic: false,
      gfm: true,
      breaks: false,
      sanitize: false,
      smartypants: false,
      xhtml: false
    };

    marked.setOptions(markedOptions);

    var fixedResponseText = fixCodeBlocks(response.text);
    const html = marked.parse(fixedResponseText);

    div.innerHTML = html;

    const codeBlocks = div.querySelectorAll('pre > code');

    for (let i = 0; i < codeBlocks.length; i++) {
      const codeBlock = codeBlocks[i] as HTMLElement;
      const innerText = codeBlock.innerText;
    
      const insertButton = createCodeSnippetButton('Insert', 'bg-indigo-600', (e) => {
        e.preventDefault();
        const code = codeBlock?.innerText;
        if (code) {
          vscode.postMessage({
            type: 'codeSelected',
            value: code
          });
        }
      });
    
      const copyButton = createCodeSnippetButton('Copy', 'bg-blue-400', (e) => {
        e.preventDefault();
        const code = codeBlock.innerText;
        navigator.clipboard.writeText(code).then(() => {
          console.log('Code copied to clipboard');
          const popup = createCodeSnippetPopup('Code copied to clipboard');
          document.body.appendChild(popup);
          setTimeout(() => {
            popup.remove();
          }, 2000);
        });
      });
    
      codeBlock.parentNode?.parentNode?.insertBefore(insertButton, codeBlock.parentNode);
      codeBlock.parentNode?.parentNode?.insertBefore(copyButton, codeBlock.parentNode);
    
      codeBlock.classList.add('hljs');
    }

  }

  function createCodeSnippetButton(text: string, color: string, clickHandler: (e: MouseEvent) => void) {
    const button = document.createElement('button');
    button.textContent = text;
    button.classList.add(
      'text-xs',
      'font-medium',
      'leading-5',
      'text-white',
      'hover:bg-gray-500',
      'focus:outline-none',
      'focus:ring',
      'focus:ring-opacity-50',
      'px-2',
      'py-1',
      'rounded-sm',
      color
    );
    button.addEventListener('click', clickHandler);
    return button;
  }
  
  function createCodeSnippetPopup(text: string) {
    const popup = document.createElement('div');
    popup.textContent = text;
    popup.classList.add(
      'text-xs',
      'font-medium',
      'leading-5',
      'text-white',
      'bg-green-500',
      'p-2',
      'rounded-sm',
      'absolute',
      'top-0',
      'right-0',
      'mt-2',
      'mr-2'
    );
    return popup;
  }

  function clearResponses(){
    const responsesDiv = document.getElementById("responses") as HTMLDivElement;
    // delete all children of responsesDiv
    while (responsesDiv.firstChild) {
      responsesDiv.removeChild(responsesDiv.firstChild);
    }
    lastResponse = null;
  }

  function updateRequest(request: ChatRequest){
    // TODO
  }

  function updateEvent(event: ChatEvent){
    // TODO
  }

  function setWorkingState(state: string) {
    workingState = state;
    toggleStopButton(workingState === 'asking');
    const workingStateElement = document.getElementById('working-state') as HTMLElement;
    if (workingState === 'asking') {
      workingStateElement.innerText = 'Thinking...';
    } else {
      workingStateElement.innerText = '';
    }
  }

  function toggleStopButton(enabled: boolean) {
    const button = document.getElementById('stop-button') as HTMLButtonElement;
    if (enabled) {
      button.disabled = false;
      button.classList.remove('bg-gray-400', 'cursor-not-allowed');
      button.classList.add('bg-red-600', 'hover:bg-red-700');
    } else {
      button.disabled = true;
      button.classList.remove('bg-red-600', 'hover:bg-red-700');
      button.classList.add('bg-gray-400', 'cursor-not-allowed');
    }
  }

  // Listen for keyup events on the prompt input element
  const promptInput = document.getElementById('prompt-input') as HTMLInputElement;
  promptInput.addEventListener('keyup', (e: KeyboardEvent) => {
    // If the key combination that was pressed was Ctrl+Enter
    if (e.keyCode === 13 && e.ctrlKey) {
      sendMessage(promptInput.value);
    }
  });

  // Listen for click events on the "send-request" button
  const sendButton = document.getElementById('send-request') as HTMLButtonElement;
  sendButton.addEventListener('click', () => {
    sendMessage(promptInput.value);
  });

  // Function to send a message to the extension
  function sendMessage(value: string) {
    vscode.postMessage({
      type: 'prompt',
      value: value
    });
  }

  // Listen for click events on the stop button
  const stopButton = document.getElementById('stop-button') as HTMLButtonElement;
  stopButton.addEventListener('click', () => {
    vscode.postMessage({
      type: 'abort'
    });
  });

  // Listen for click events on the reset button and send message resetConversation
  const resetButton = document.getElementById('reset-button') as HTMLButtonElement;
  resetButton.addEventListener('click', () => {
    vscode.postMessage({
      type: 'resetConversation'
    });
  });

  vscode.postMessage({type: 'webviewLoaded'});
})();

