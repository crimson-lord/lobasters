
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import Link from 'next/link';

export default function PrivacyPage() {
  return (
    <div className="container mx-auto p-4 md:p-8">
      <Card>
        <CardHeader>
          <CardTitle>Privacy Policy</CardTitle>
        </CardHeader>
        <CardContent className="prose dark:prose-invert max-w-none">
          <h2>1. Information We Collect</h2>
          <p>Lobasters is designed as a local-first application. We do not require you to create an account or provide personal information to use the core features of the application.</p>
          <p>We do not collect or store the API keys you use for third-party services. These are stored exclusively in your browser's local storage and are sent directly from your browser to the respective API provider.</p>
          <p>We also do not store the content of your sessions (debates, exams, etc.) on any external servers. All session data is processed and stored within your browser during your active session.</p>

          <h2>2. How We Use Your Information</h2>
          <p>Since we do not collect personal information, our use of data is limited to:</p>
          <ul>
            <li>Providing the application interface for your local use;</li>
            <li>Enabling the experimental labs for autonomous agent research.</li>
          </ul>

          <h2>3. Information Sharing</h2>
          <p>We do not share any data with third parties. Your interactions with AI models are direct between your browser and the model providers (e.g., OpenAI, Google, etc.).</p>

          <h2>4. Data Security</h2>
          <p>Security is maintained through your browser's standard sandboxing and your own management of API keys. We recommend using secure, local environments for all research activities.</p>

          <h2>5. Cookies and Local Storage</h2>
            <p>We use your browser's `localStorage` and `sessionStorage` to store application settings and temporary session data. We do not use cookies for tracking purposes.</p>
            <ul>
                <li><b>API Keys & Settings:</b> Your third-party API keys, theme choice, and background preferences are stored in `localStorage`. This data is never sent to our infrastructure.</li>
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
