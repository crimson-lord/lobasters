
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import Link from 'next/link';
import { PageNavigationTools } from '@/components/webmcp/page-navigation-tools';

export default function PrivacyPage() {
  return (
    <div className="container mx-auto p-4 md:p-8">
      <PageNavigationTools page="privacy" />
      <Card>
        <CardHeader>
          <CardTitle>Privacy Policy</CardTitle>
        </CardHeader>
        <CardContent className="prose dark:prose-invert max-w-none">
          <h2>1. Information We Collect</h2>
          <p>Lobasters is designed as a local-first application. We do not require you to create an account or provide personal information to use the core features of the application.</p>
          <p>We do not collect or persist the API keys you use for third-party services. Keys are held by your browser while you configure a session, then sent through Lobasters&apos; streaming relay only for the duration of a request to the provider you select.</p>
          <p>We do not persist the content of your sessions (debates, exams, etc.) in a database. Session data is held in your browser during an active session; model requests necessarily pass through the streaming relay before reaching your selected provider.</p>

          <h2>2. How We Use Your Information</h2>
          <p>Since we do not collect personal information, our use of data is limited to:</p>
          <ul>
            <li>Providing the application interface for your local use;</li>
            <li>Enabling the experimental labs for autonomous agent research.</li>
          </ul>

          <h2>3. Information Sharing</h2>
          <p>Model prompts, API credentials, and responses are transmitted to the provider you choose. Lobasters&apos; streaming relay forwards those requests to support provider-compatible streaming and does not retain them.</p>

          <h2>4. Data Security</h2>
          <p>Security is maintained through your browser's standard sandboxing and your own management of API keys. We recommend using secure, local environments for all research activities.</p>

          <h2>5. Cookies and Local Storage</h2>
            <p>We use your browser's `localStorage` and `sessionStorage` to store application settings and temporary session data. We do not use cookies for tracking purposes.</p>
            <ul>
                <li><b>API Keys &amp; Settings:</b> Themes and background preferences are stored in <code>localStorage</code>. API credentials are not persisted by Lobasters, but are transmitted through the streaming relay while a model request is running.</li>
                <li><b>Storage Limits:</b> Browsers typically limit `localStorage` to about 5MB. Custom background images are limited to 5MB to ensure compatibility with these browser quotas.</li>
            </ul>

          <h2>6. Changes to This Policy</h2>
          <p>We may update this Privacy Policy from time to time. We will notify you of any changes by posting the new Privacy Policy on this page.</p>
          
          <div className="mt-8">
            <Link href="/">
              <Button variant="outline">Back to Home</Button>
            </Link>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
