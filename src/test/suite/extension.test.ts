import * as assert from 'assert';

// You can import and use all API from the 'vscode' module
// as well as import your extension to test it
import * as vscode from 'vscode';
// import * as myExtension from '../../extension';
import * as chatgptai from '../../extension';

suite('Extension Test Suite', () => {
	vscode.window.showInformationMessage('Start all tests.');

	// test('Sample test', () => {
	// 	assert.strictEqual(-1, [1, 2, 3].indexOf(5));
	// 	assert.strictEqual(-1, [1, 2, 3].indexOf(0));
	// });

    test('Extension was loaded', async () => {
        await vscode.extensions.getExtension('YaleHuang.chatgpt-ai')?.activate();
		const extension = vscode.extensions.getExtension('YaleHuang.chatgpt-ai');
		assert.ok(extension, 'Extension is not installed.');
    });
});
