import { BrowserWindow, WebContentsView } from "electron";
import { isAllowedLoopbackUrl } from "../security/allowlist";

export class WebViewManager {
  private view: WebContentsView | null = null;
  private visible = true;
  private customBounds: { x: number; y: number; width: number; height: number } | null = null;

  constructor(private readonly win: BrowserWindow) {}

  ensureView(): WebContentsView {
    if (this.view) {
      return this.view;
    }

    this.view = new WebContentsView({
      webPreferences: {
        sandbox: true,
        nodeIntegration: false,
        contextIsolation: true
      }
    });

    this.win.contentView.addChildView(this.view);
    this.attachGuards(this.view);
    this.layout();
    return this.view;
  }

  layout(): void {
    if (!this.view) {
      return;
    }

    if (!this.visible) {
      this.view.setBounds({ x: 0, y: 0, width: 0, height: 0 });
      return;
    }

    if (this.customBounds) {
      this.view.setBounds(this.customBounds);
      return;
    }

    const [width, height] = this.win.getContentSize();
    const topHeight = Math.max(220, Math.floor(height * 0.5));
    this.view.setBounds({ x: 280, y: 0, width: Math.max(width - 280, 300), height: topHeight });
  }

  setVisible(visible: boolean): void {
    this.visible = visible;
    this.ensureView();
    this.layout();
  }

  setBounds(bounds: { x: number; y: number; width: number; height: number }): void {
    this.customBounds = bounds;
    this.ensureView();
    this.layout();
  }

  async loadTarget(url: string): Promise<void> {
    const view = this.ensureView();
    if (!isAllowedLoopbackUrl(url)) {
      throw new Error(`Blocked URL by loopback allowlist: ${url}`);
    }

    await view.webContents.loadURL(url);
  }

  private attachGuards(target: WebContentsView): void {
    target.webContents.setWindowOpenHandler(({ url }) => {
      if (!isAllowedLoopbackUrl(url)) {
        return { action: "deny" };
      }
      return { action: "allow" };
    });

    target.webContents.on("will-navigate", (event, nextUrl) => {
      if (!isAllowedLoopbackUrl(nextUrl)) {
        event.preventDefault();
      }
    });

    target.webContents.session.setPermissionRequestHandler((_wc, _permission, callback) => {
      callback(false);
    });
  }
}
