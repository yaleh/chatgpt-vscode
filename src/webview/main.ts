// @ts-ignore 

import * as marked from 'marked';
import hljs from 'highlight.js';
import * as $ from 'jquery';
import 'jquery-ui/ui/widgets/autocomplete';

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
  let cachedPrompts: string[] = [];


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
      case "addRequest": {
        updateRequest(message.value as ChatRequest);
        break;
      }
      case "addEvent": {
        updateEvent(message.value as ChatEvent);
        break;
      }
      case "clearResponses": {
        clearResponses();
        break;
      }
      case "setTask": {
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
      case "promptsLoaded": {
        cachedPrompts = message.value;
        break;
      }
      case 'setContextSelection': {
        const selection = message.value;
        $('#context-select').val(selection);
        // set the value of html selection context-select to message.value with jQuery
        break;
      }
    }
  });

  function updateConversationId(id: string): void {
    $('#conversation-id').text(`Conversation ID: ${id || '/'}`);
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

    updateMessageDiv(updatedResponseDiv, response.text);

    const timestamp = new Date().toLocaleString();
    updatedResponseDiv.append($('<div>').text(timestamp).addClass('timestamp text-xs text-gray-500'));

    lastResponse = response;

    // Scroll to the bottom of the messages container
    const messagesContainer = $('#messages-container');
    messagesContainer.scrollTop(messagesContainer[0].scrollHeight);
  }

  function updateMessageDiv(div: JQuery<HTMLElement>, text: string) {
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

    var fixedResponseText = fixCodeBlocks(text);
    const html = marked.parse(fixedResponseText);

    // Create a new div with ID "rendered"
    const renderedDiv = $('<div>').attr('id', 'rendered');
    renderedDiv.html(html);

    // Create a new div with ID "raw"
    const rawDiv = $('<div>').attr('id', 'raw');

    // Create a new pre tag for the code snippet and add CSS to wrap the content and enable x-axis overflow scrollbar
    const preTag = $('<pre>').addClass('hljs').css({'overflow-x': 'auto' }).appendTo(rawDiv);

    // Create a new code tag for the code snippet
    const codeTag = $('<code>').addClass('markdown').text(text).appendTo(preTag);

    // Highlight the code snippet using hljs
    hljs.highlightBlock(codeTag[0]);

    const toolbarMessageCopy = $('div#response_templates > div#toolbar-message').clone();
    const deleteBtn = toolbarMessageCopy.find('button.delete-btn');
    const markdownBtn = toolbarMessageCopy.find('button.markdown-btn');

    // Add click event listener to markdownBtn
    markdownBtn.on('click', function () {
      renderedDiv.toggle();
      rawDiv.toggle();
    });

    deleteBtn.on('click', function () {
      toolbarMessageCopy.parent().remove();
    });

    div.empty(); // Clear the content of the "div" element
    div.prepend(toolbarMessageCopy);
    // Add the "rendered" div to the "div" element
    div.append(renderedDiv);
    // Add the "raw" div to the "div" element and hide it
    div.append(rawDiv.hide());

    renderedDiv.find('pre > code').each((i, codeBlock) => {
      const code = $(codeBlock)?.text();

      const toolbarCopy = $('div#response_templates > div#toolbar-code').clone();
      toolbarCopy.insertBefore($(codeBlock).parent());

      // Add click event listener to button element
      toolbarCopy.find('button.insert-btn').on('click', (e: JQuery.ClickEvent) => {
        e.preventDefault();
        if (code) {
          vscode.postMessage({
            type: 'codeSelected',
            value: code
          });
        }
      });

      toolbarCopy.find('button.copy-btn').on('click', (e) => {
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

      $(codeBlock).addClass('hljs');
    });

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
    const responsesDiv = $('#responses');
    let updatedRequestDiv = $('<div>').addClass('request m-1 p-1');
    responsesDiv.append(updatedRequestDiv);

    updateMessageDiv(updatedRequestDiv, request.text);

    const timestamp = new Date().toLocaleString();
    updatedRequestDiv.append($('<div>').text(timestamp).addClass('timestamp text-xs text-gray-500'));

    // Scroll to the bottom of the messages container
    const messagesContainer = $('#messages-container');
    messagesContainer.scrollTop(messagesContainer[0].scrollHeight);
  }

  function updateEvent(event: ChatEvent) {
    const responsesDiv = $('#responses');
    let updatedRequestDiv = $('<div>').addClass('event m-1 p-1 text-gray-500');
    responsesDiv.append(updatedRequestDiv);

    updateMessageDiv(updatedRequestDiv, event.text);

    const timestamp = new Date().toLocaleString();
    updatedRequestDiv.append($('<div>').text(timestamp).addClass('timestamp text-xs text-gray-500'));

    // Scroll to the bottom of the messages container
    const messagesContainer = $('#messages-container');
    messagesContainer.scrollTop(messagesContainer[0].scrollHeight);
  }

  function setWorkingState(state: string): void {
    workingState = state;
    toggleStopButton(workingState === 'asking');
    $('#working-state').text(workingState === 'asking' ? 'Thinking...' : '');
  }

  function toggleStopButton(enabled: boolean): void {
    const button = $('#stop-button');
    if (enabled) {
      button.prop('disabled', false)
        .removeClass('cursor-not-allowed')
        .addClass('bg-red-600 hover:bg-red-700');
    } else {
      button.prop('disabled', true)
        .removeClass('bg-red-600 hover:bg-red-700')
        .addClass('cursor-not-allowed');
    }
  }

  // Function to send a message to the extension
  function sendMessage(value: string) {
    vscode.postMessage({
      type: 'sendPrompt',
      value: {
        task: value,
        context: $('#context-select').val()
      }
    });
  }

  // vscode.postMessage({ type: 'webviewLoaded' });

  $(document).ready(function () {
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

    $('#prompt-input').autocomplete({
      position: { my: "left bottom", at: "left top" },
      source: function (request: any, response: Function) {
        // if cachedPrompts is empty, postMessage 'loadPrompts'
        if(cachedPrompts.length === 0) {
          vscode.postMessage({ type: 'loadPrompts'});
          return;
        }

        const searchTerm = request.term.toLowerCase(); // convert search term to lowercase
        const matches = $.grep(cachedPrompts, function (item) {
          return item.toLowerCase().indexOf(searchTerm) >= 0; // convert item to lowercase before comparing
        });
        response(matches);
      }
    });

    vscode.postMessage({ type: 'webviewLoaded' });
  });

})();

