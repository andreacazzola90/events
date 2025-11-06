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

  static async handleFacebookModalsAndCookies(page: any): Promise<void> {
    console.log('🍪 Handling Facebook modals and cookies...');
    
    try {
      // Wait a moment for page to load
      await new Promise(resolve => setTimeout(resolve, 2000));
      
      // Accept cookies banner if present
      const cookieSelectors = [
        '[data-testid="cookie-policy-manage-dialog"] button[data-testid="cookie-policy-manage-dialog-accept-button"]',
        '[data-testid="cookie-policy-banner-accept"]',
        'button[data-cookiebanner="accept_button"]',
        'button[title="Accept All"]',
        'button:contains("Accept All")',
        'button:contains("Accetta tutti")',
        '[aria-label="Accept all cookies"]',
        '[aria-label="Accetta tutti i cookie"]'
      ];
      
      for (const selector of cookieSelectors) {
        try {
          const cookieButton = await page.$(selector);
          if (cookieButton) {
            console.log('✅ Found cookie banner, accepting...');
            await cookieButton.click();
            await new Promise(resolve => setTimeout(resolve, 1000));
            break;
          }
        } catch (e) {
          // Continue trying other selectors
        }
      }
      
      // Close login modal if present
      const loginModalSelectors = [
        '[role="dialog"] [aria-label="Close"]',
        '[role="dialog"] button[aria-label="Chiudi"]',
        '[data-testid="royal_login_form"] [aria-label="Close"]',
        'div[data-testid="cookie-policy-manage-dialog"] [aria-label="Close"]',
        '[role="dialog"] svg[aria-label="Close"]',
        'button[aria-label="Close login dialog"]',
        '[aria-label="Chiudi finestra di dialogo di accesso"]'
      ];
      
      for (const selector of loginModalSelectors) {
        try {
          await page.waitForSelector(selector, { timeout: 2000 });
          const closeButton = await page.$(selector);
          if (closeButton) {
            console.log('❌ Found login modal, closing...');
            await closeButton.click();
            await new Promise(resolve => setTimeout(resolve, 1000));
            break;
          }
        } catch (e) {
          // Continue trying other selectors
        }
      }
      
      // Handle "Not Now" or "Maybe Later" buttons
      const dismissSelectors = [
        'button:contains("Not Now")',
        'button:contains("Non ora")',
        'button:contains("Maybe Later")',
        'button:contains("Più tardi")',
        '[aria-label="Not Now"]',
        '[aria-label="Non ora"]'
      ];
      
      for (const selector of dismissSelectors) {
        try {
          const dismissButton = await page.$(selector);
          if (dismissButton) {
            console.log('⏭️ Found "Not Now" button, clicking...');
            await dismissButton.click();
            await new Promise(resolve => setTimeout(resolve, 1000));
            break;
          }
        } catch (e) {
          // Continue trying other selectors
        }
      }
      
      console.log('✅ Facebook modals handled successfully');
      
    } catch (error) {
      console.warn('⚠️ Error handling Facebook modals:', error);
    }
  }

  static async navigateToFacebookEvent(page: any, targetUrl: string): Promise<boolean> {
    console.log('🔍 Navigating to Facebook event without login...');
    
    try {
      // Navigate to the URL
      await page.goto(targetUrl, { 
        waitUntil: 'networkidle2', 
        timeout: 30000 
      });
      
      // Handle modals and cookies
      await this.handleFacebookModalsAndCookies(page);
      
      // Try to scroll to load more content
      await page.evaluate(() => {
        window.scrollTo(0, document.body.scrollHeight / 3);
      });
      
      await new Promise(resolve => setTimeout(resolve, 2000));
      
      // Check if we can see event content
      const hasEventContent = await page.evaluate(() => {
        const indicators = [
          // Event title indicators
          '[data-testid="event-permalink-event-name"]',
          'h1[data-testid="event-title"]',
          '[role="main"] h1',
          'div[data-pagelet="EventHeaderContent"]',
          
          // Event details indicators  
          '[data-testid="event-permalink-details"]',
          'div[data-testid="event-time-info"]',
          '[aria-label*="event"]',
          '[aria-label*="evento"]'
        ];
        
        return indicators.some(selector => document.querySelector(selector));
      });
      
      if (hasEventContent) {
        console.log('✅ Facebook event content detected');
        return true;
      } else {
        console.log('⚠️ No event content detected, may need login');
        return false;
      }
      
    } catch (error) {
      console.error('❌ Error navigating to Facebook event:', error);
      return false;
    }
  }

  static async authenticateIfNeeded(page: any, targetUrl: string): Promise<boolean> {
    if (!this.isFacebookUrl(targetUrl)) {
      return true; // No authentication needed for non-Facebook URLs
    }

    console.log('🔍 Facebook URL detected, attempting smart navigation...');

    // First try: Navigate without login and handle modals
    const nonLoginSuccess = await this.navigateToFacebookEvent(page, targetUrl);
    if (nonLoginSuccess) {
      return true;
    }

    console.log('🔄 Non-login access failed, trying authentication methods...');

    // Try cookies first (if available)
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

    console.log('⚠️ All authentication methods failed, proceeding with limited access');
    return false;
  }
}