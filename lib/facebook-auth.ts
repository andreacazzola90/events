export interface FacebookCookie {
  name: string;
  value: string;
  domain: string;
  path: string;
  expires?: number;
  httpOnly?: boolean;
  secure?: boolean;
  sameSite?: 'Strict' | 'Lax' | 'None';
}

export class FacebookAuth {
  
  static isFacebookUrl(url: string): boolean {
    return url.includes('facebook.com') || url.includes('fb.com') || url.includes('m.facebook.com');
  }

  static async loginWithCookies(page: any, cookies: FacebookCookie[]): Promise<boolean> {
    try {
      console.log('🍪 Setting Facebook cookies for authentication...');
      
      // Navigate to Facebook first to set the domain
      await page.goto('https://www.facebook.com', { waitUntil: 'networkidle2', timeout: 30000 });
      
      // Set cookies
      for (const cookie of cookies) {
        await page.setCookie(cookie);
      }
      
      console.log(`✅ Set ${cookies.length} Facebook cookies`);
      
      // Refresh to apply cookies
      await page.reload({ waitUntil: 'networkidle2' });
      
      // Check if login was successful by looking for user-specific elements
      const isLoggedIn = await page.evaluate(() => {
        // Look for elements that indicate a logged-in state
        return !!(
          document.querySelector('[data-testid="blue_bar"]') ||
          document.querySelector('[role="banner"]') ||
          document.querySelector('[aria-label="Facebook"]') ||
          document.querySelector('div[data-pagelet="LeftRail"]') ||
          document.querySelector('[data-testid="left_nav_menu_list"]')
        );
      });
      
      if (isLoggedIn) {
        console.log('✅ Facebook login successful via cookies');
        return true;
      } else {
        console.log('❌ Facebook login failed - cookies may be expired');
        return false;
      }
    } catch (error) {
      console.error('❌ Error setting Facebook cookies:', error);
      return false;
    }
  }

  static async loginWithCredentials(page: any, email: string, password: string): Promise<boolean> {
    try {
      console.log('🔐 Attempting Facebook login with credentials...');
      
      // Navigate to Facebook login page
      await page.goto('https://www.facebook.com/login', { waitUntil: 'networkidle2', timeout: 30000 });
      
      // Wait for login form
      await page.waitForSelector('#email', { timeout: 10000 });
      
      // Fill in credentials
      await page.type('#email', email, { delay: 100 });
      await page.type('#pass', password, { delay: 100 });
      
      // Add human-like delay before clicking login
      await new Promise(resolve => setTimeout(resolve, 1000 + Math.random() * 1000));
      
      // Click login button
      await page.click('[name="login"]');
      
      // Wait for navigation
      await page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 30000 });
      
      // Check if login was successful
      const currentUrl = page.url();
      if (currentUrl.includes('facebook.com') && !currentUrl.includes('/login')) {
        console.log('✅ Facebook login successful via credentials');
        return true;
      } else {
        console.log('❌ Facebook login failed - check credentials or captcha required');
        return false;
      }
    } catch (error) {
      console.error('❌ Error during Facebook credential login:', error);
      return false;
    }
  }

  static parseCookiesFromString(cookieString: string): FacebookCookie[] {
    if (!cookieString || typeof cookieString !== 'string') {
      return [];
    }

    try {
      // If it's JSON format
      if (cookieString.startsWith('[') || cookieString.startsWith('{')) {
        return JSON.parse(cookieString);
      }

      // If it's browser cookie format (name=value; name2=value2)
      const cookies: FacebookCookie[] = [];
      const cookiePairs = cookieString.split(';');
      
      for (const pair of cookiePairs) {
        const [name, value] = pair.split('=').map(s => s.trim());
        if (name && value) {
          cookies.push({
            name,
            value,
            domain: '.facebook.com',
            path: '/'
          });
        }
      }
      
      return cookies;
    } catch (error) {
      console.error('❌ Error parsing cookies:', error);
      return [];
    }
  }

  static async authenticateIfNeeded(page: any, targetUrl: string): Promise<boolean> {
    if (!this.isFacebookUrl(targetUrl)) {
      return true; // No authentication needed for non-Facebook URLs
    }

    console.log('🔍 Facebook URL detected, attempting authentication...');

    // Try cookies first (recommended)
    const cookieString = process.env.FACEBOOK_COOKIES;
    if (cookieString) {
      const cookies = this.parseCookiesFromString(cookieString);
      if (cookies.length > 0) {
        const cookieSuccess = await this.loginWithCookies(page, cookies);
        if (cookieSuccess) {
          return true;
        }
      }
    }

    // Fallback to credentials if cookies failed
    const email = process.env.FACEBOOK_EMAIL;
    const password = process.env.FACEBOOK_PASSWORD;
    
    if (email && password) {
      console.log('🔄 Cookies failed, trying credentials...');
      const credentialSuccess = await this.loginWithCredentials(page, email, password);
      if (credentialSuccess) {
        return true;
      }
    }

    console.log('⚠️ No valid Facebook authentication method available');
    return false;
  }
}