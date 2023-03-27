import * as fs from 'fs';
import * as ts from 'typescript';

interface Chunker {
    chunkCode(code: string): string[];
    chunkFile(filePath: string): Promise<string[]>;
}

interface Vectorizer {
    vectorizeChunks(chunks: string[]): number[][];
    vectorizeFile(filePath: string): Promise<number[][]>;
}

interface Tokenizer {
    tokenize(text: string): string[];
}

class RegexTokenizer implements Tokenizer {
    constructor(private readonly pattern: RegExp) { }

    public tokenize(text: string): string[] {
        // TODO: Implement regex-based tokenization logic for the text
        return [];
    }
}

class CodeChunker implements Chunker {
    constructor(private readonly tokenizer: Tokenizer) { }

    public chunkCode(code: string): string[] {
        // TODO: Implement code chunking logic for the code
        return [];
    }

    public chunkFile(filePath: string): Promise<string[]> {
        return fs.promises.readFile(filePath, { encoding: 'utf-8' }).then((fileContent) => {
            const fileChunks = this.chunkCode(fileContent);
            return fileChunks;
        });
    }
}

class ChunkVectorizer implements Vectorizer {
    constructor(private readonly tokenizer: Tokenizer, private readonly chunker: Chunker) { }

    public vectorizeChunks(chunks: string[]): number[][] {
        // TODO: Implement chunk vectorization logic for the chunks
        return [];
    }

    public vectorizeFile(filePath: string): Promise<number[][]> {
        return this.chunker.chunkFile(filePath).then((fileChunks) => {
            const chunkVectors = this.vectorizeChunks(fileChunks);
            return chunkVectors;
        });
    }
}

class ChunkerFactory {
    public static createChunker(language: string, tokenizer: Tokenizer, maxChunkLength: number): Chunker {
        switch (language.toLowerCase()) {
            case 'typescript':
                return new TypeScriptCodeChunker(tokenizer, maxChunkLength);
            default:
                return new CodeChunker(tokenizer);
        }
    }
}

class TypeScriptCodeChunker implements Chunker {
    constructor(private readonly tokenizer: Tokenizer, private readonly maxChunkLength: number) { }

    private traverseNode(node: ts.Node, chunks: string[]) {
        if (ts.isFunctionLike(node) || ts.isClassLike(node)) {
            const block = node.getChildren()[node.getChildCount() - 1];
            if (block) {
                this.traverseNode(block, chunks);
            }
            return;
        }

        const token = this.tokenizer.tokenize(node.getText()).join('');
        if (token) {
            let lastChunk = chunks[chunks.length - 1];
            if (!lastChunk || lastChunk.length + token.length > this.maxChunkLength) {
                chunks.push(token);
                lastChunk = token;
            } else {
                chunks[chunks.length - 1] += token;
            }

            if (lastChunk.length > this.maxChunkLength) {
                const newChunks = this.chunkCode(lastChunk);
                chunks.pop();
                chunks.push(...newChunks);
            }
        }

        node.getChildren().forEach(childNode => {
            this.traverseNode(childNode, chunks);
        });
    }

    public chunkCode(code: string): string[] {
        const sourceFile = ts.createSourceFile('', code, ts.ScriptTarget.Latest, true);
        const chunks: string[] = [];
        this.traverseNode(sourceFile, chunks);
        return chunks;
    }

    public chunkFile(filePath: string): Promise<string[]> {
        return fs.promises.readFile(filePath, { encoding: 'utf-8' }).then((fileContent) => {
            const fileChunks = this.chunkCode(fileContent);
            return fileChunks;
        });
    }
}

export { Chunker, Vectorizer, Tokenizer, RegexTokenizer, CodeChunker, ChunkVectorizer, ChunkerFactory, TypeScriptCodeChunker };