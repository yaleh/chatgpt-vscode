// @ts-ignore 

import * as marked from 'marked';
import hljs from 'highlight.js';
import * as $ from 'jquery';

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
        $('#prompt-input').val(message.value);
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

  function updateConversationId(id: string): void {
    const conversationId = id || "/";
    const conversationIdText = `Conversation ID: ${conversationId}`;
    const conversationIdElement = $('#conversation-id');
    conversationIdElement.text(conversationIdText);
  }

  function fixCodeBlocks(response: string) {
    const REGEX_CODEBLOCK = new RegExp('\`\`\`', 'g');
    const matches = response.match(REGEX_CODEBLOCK);

    const count = matches ? matches.length : 0;
    return count % 2 === 0 ? response : response.concat('\n\`\`\`');
  }

  let lastResponse: ChatResponse | null = null;

  function updateResponse(response: ChatResponse): void {
    const responsesDiv = $('#responses');
    let updatedResponseDiv: JQuery<HTMLElement> | null = null;

    if (responsesDiv.children().length > 0 && (response.id === null || response?.id === lastResponse?.id)) {
      // Update the existing response
      updatedResponseDiv = responsesDiv.children().last() as JQuery<HTMLElement>;
    } else {
      // Create a new div and append it to the "response" div
      const newDiv = $('<div>').addClass('response m-1 p-1 bg-slate-800');
      responsesDiv.append(newDiv);
      updatedResponseDiv = newDiv;
    }

    updateResponseDiv(updatedResponseDiv, response);

    const timestamp = new Date().toLocaleString();
    updatedResponseDiv.append($('<div>').text(timestamp).addClass('timestamp text-xs text-gray-500'));

    lastResponse = response;
  }

  function updateResponseDiv(div: JQuery<HTMLElement>, response: ChatResponse) {
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

    div.html(html);

    div.find('pre > code').each((i, codeBlock) => {
      const code = $(codeBlock)?.text();

      const insertButton = createCodeSnippetButton('Insert', 'bg-indigo-600', (e: JQuery.ClickEvent) => {
        e.preventDefault();
        if (code) {
          vscode.postMessage({
            type: 'codeSelected',
            value: code
          });
        }
      });

      const copyButton = createCodeSnippetButton('Copy', 'bg-blue-400', (e) => {
        e.preventDefault();
        navigator.clipboard.writeText(code).then(() => {
          console.log('Code copied to clipboard');
          const popup = createCodeSnippetPopup('Code copied to clipboard');
          $('body').append(popup);
          setTimeout(() => {
            popup.remove();
          }, 2000);
        });
      });

      insertButton.insertBefore($(codeBlock).parent());
      copyButton.insertBefore($(codeBlock).parent());

      $(codeBlock).addClass('hljs');
    });

  }

  function createCodeSnippetButton(text: string, color: string, clickHandler: (e: JQuery.ClickEvent) => void): JQuery<HTMLElement> {
    const button = $('<button>').text(text).addClass([
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
    ].join(' '));
    button.on('click', clickHandler);
    return button;
  }

  function createCodeSnippetPopup(text: string): JQuery<HTMLElement> {
    const popup = $('<div>').text(text).addClass('text-xs font-medium leading-5 text-white bg-green-500 p-2 rounded-sm absolute top-0 right-0 mt-2 mr-2');
    return popup;
  }

  function clearResponses() {
    $("#responses").empty();
    lastResponse = null;
  }

  function updateRequest(request: ChatRequest) {
    // TODO
  }

  function updateEvent(event: ChatEvent) {
    // TODO
  }

  function setWorkingState(state: string): void {
    workingState = state;
    toggleStopButton(workingState === 'asking');
    const workingStateElement = $('#working-state');
    if (workingState === 'asking') {
      workingStateElement.text('Thinking...');
    } else {
      workingStateElement.text('');
    }
  }

  function toggleStopButton(enabled: boolean): void {
    const button = $('#stop-button');
    if (enabled) {
      button.prop('disabled', false)
        .removeClass('bg-gray-400 cursor-not-allowed')
        .addClass('bg-red-600 hover:bg-red-700');
    } else {
      button.prop('disabled', true)
        .removeClass('bg-red-600 hover:bg-red-700')
        .addClass('bg-gray-400 cursor-not-allowed');
    }
  }

  // Listen for keyup events on the prompt input element
  const promptInput = $('#prompt-input');
  promptInput.on('keyup', (e: JQuery.KeyUpEvent) => {
    // If the key combination that was pressed was Ctrl+Enter
    if (e.keyCode === 13 && e.ctrlKey) {
      sendMessage(promptInput.val() as string);
    }
  });

  const sendButton = $('#send-request');
  sendButton.on('click', () => {
    sendMessage(promptInput.val() as string);
  });

  // Function to send a message to the extension
  function sendMessage(value: string) {
    vscode.postMessage({
      type: 'prompt',
      value: value
    });
  }

  // Listen for click events on the stop button
  $('#stop-button').on('click', () => {
    vscode.postMessage({
      type: 'abort'
    });
  });

  // Listen for click events on the reset button and send message resetConversation
  $('#reset-button').on('click', () => {
    vscode.postMessage({
      type: 'resetConversation'
    });
  });

  vscode.postMessage({ type: 'webviewLoaded' });
})();

