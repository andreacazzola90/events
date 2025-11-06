declare module '@sparticuz/chromium' {
  export function executablePath(): Promise<string>;
  export const args: string[];
  export const defaultViewport: { width: number; height: number };
  export const puppeteer: any;
}