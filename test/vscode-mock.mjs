/**
 * Minimal `vscode` stand-in for unit tests (T-0008).
 *
 * Committed plain JS so `node --test` needs no extra tooling. The loader
 * (`./loader-hooks.mjs`) maps bare `import ... from "vscode"` / 
 * `require("vscode")` to this file. Enum values mirror the real API
 * (`LanguageModelChatMessageRole.User = 1, Assistant = 2`); classes exist
 * so `instanceof` checks in `src/` behave. Anything unimplemented throws
 * loudly rather than silently passing.
 */

export var LanguageModelChatMessageRole;
(function (LanguageModelChatMessageRole) {
  LanguageModelChatMessageRole[LanguageModelChatMessageRole["User"] = 1] = "User";
  LanguageModelChatMessageRole[LanguageModelChatMessageRole["Assistant"] = 2] = "Assistant";
})(LanguageModelChatMessageRole || (LanguageModelChatMessageRole = {}));

export class LanguageModelTextPart {
  constructor(value) {
    this.value = value;
  }
}

export class LanguageModelToolCallPart {
  constructor(callId, name, input) {
    this.callId = callId;
    this.name = name;
    this.input = input;
  }
}

export class LanguageModelToolResultPart {
  constructor(callId, content) {
    this.callId = callId;
    this.content = content;
  }
}

export class LanguageModelDataPart {
  constructor(data, mimeType) {
    this.data = data;
    this.mimeType = mimeType;
  }
}

export class LanguageModelThinkingPart {
  constructor(value) {
    this.value = value;
  }
}

/** Captured output-channel lines (assertable via `__outputLines`). */
export const __outputLines = [];

export function __resetOutput() {
  __outputLines.length = 0;
}

function makeChannel() {
  return {
    append(value) {
      __outputLines.push(String(value));
    },
    appendLine(value) {
      __outputLines.push(String(value));
    },
    show() {},
    hide() {},
    clear() {},
    dispose() {},
  };
}

export const window = {
  createOutputChannel() {
    return makeChannel();
  },
  showInformationMessage() {
    return Promise.resolve(undefined);
  },
  showWarningMessage() {
    return Promise.resolve(undefined);
  },
  showErrorMessage() {
    return Promise.resolve(undefined);
  },
};

export const workspace = {
  getConfiguration() {
    return { get: () => undefined, update: () => Promise.resolve() };
  },
  workspaceFolders: undefined,
};

export const commands = {
  executeCommand() {
    return Promise.resolve(undefined);
  },
};

export class EventEmitter {
  constructor() {
    this.event = () => ({ dispose: () => {} });
  }
  fire() {}
  dispose() {}
}
