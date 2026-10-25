import {
  AppBridge,
  PostMessageTransport,
} from '@modelcontextprotocol/ext-apps/app-bridge';
const frame = document.querySelector<HTMLIFrameElement>('#app')!;
const bridge = new AppBridge(
  null,
  { name: 'Physics of Design integration host', version: '1.0.0' },
  { serverTools: {}, updateModelContext: {} },
);
bridge.oncalltool = async (params) => await (window as any).serverTool(params);
bridge.onupdatemodelcontext = async (params) => {
  (window as any).__HUMAN_CHOICE__ = params;
  return {};
};
bridge.oninitialized = async () => {
  await bridge.sendToolInput({ arguments: {} });
  await bridge.sendToolResult((window as any).__INITIAL_RESULT__);
  (window as any).__HOST_READY__ = true;
};
(window as any).__SET_RESULT__ = (result: unknown) =>
  bridge.sendToolResult(result as any);
void bridge.connect(
  new PostMessageTransport(frame.contentWindow!, frame.contentWindow!),
);
