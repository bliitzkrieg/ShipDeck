export const channels = {
  projectsList: "projects:list",
  projectsCreate: "projects:create",
  projectsUpdate: "projects:update",
  projectsDelete: "projects:delete",
  projectsPickRootPath: "projects:pickRootPath",
  projectsGitStatuses: "projects:gitStatuses",

  sessionsList: "sessions:list",
  sessionsCreate: "sessions:create",
  sessionsRename: "sessions:rename",
  sessionsDelete: "sessions:delete",

  messagesList: "messages:list",
  messagesCreate: "messages:create",

  contextActivateSession: "context:activateSession",

  terminalsCreate: "terminals:create",
  terminalsOpen: "terminals:open",
  terminalsWrite: "terminals:write",
  terminalsWriteInput: "terminals:writeInput",
  terminalsResize: "terminals:resize",
  terminalsKill: "terminals:kill",

  serverStart: "server:start",
  serverRestart: "server:restart",
  serverGetLatestPort: "server:getLatestPort",

  webTargetSet: "webTarget:set",
  preferencesGet: "preferences:get",
  preferencesSetDefaultSessionProvider: "preferences:setDefaultSessionProvider",
  webViewSetVisible: "webview:setVisible",
  webViewSetBounds: "webview:setBounds",
  webViewLoadTarget: "webview:loadTarget",
  systemOpenExternal: "system:openExternal",
  appWindowMinimize: "appWindow:minimize",
  appWindowToggleMaximize: "appWindow:toggleMaximize",
  appWindowClose: "appWindow:close",

  terminalsOnData: "terminals:onData",
  terminalsOnExit: "terminals:onExit",
  serverOnPortDetected: "server:onPortDetected",
  contextOnChanged: "context:onChanged"
} as const;

export type ChannelName = (typeof channels)[keyof typeof channels];
