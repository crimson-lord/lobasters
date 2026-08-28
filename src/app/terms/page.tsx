
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import Link from 'next/link';
import { PageNavigationTools } from '@/components/webmcp/page-navigation-tools';

export default function TermsPage() {
  return (
    <div className="container mx-auto p-4 md:p-8">
      <PageNavigationTools page="terms" />
      <Card>
        <CardHeader>
          <CardTitle>Terms of Service</CardTitle>
        </CardHeader>
        <CardContent className="prose dark:prose-invert max-w-none">
          <h2>1. Introduction</h2>
          <p>Welcome to Lobasters ("we," "our," "us"). These Terms of Service ("Terms") govern your use of our local-only application. By accessing or using our service, you agree to be bound by these Terms.</p>

          <h2>2. Use of Our Service</h2>
          <p>You agree to use our service in compliance with all applicable laws and regulations. You are responsible for all activities that occur during your local sessions.</p>
          <p>You must not use the service to store or transmit any content that is illegal, harmful, or infringes on the rights of others.</p>

          <h2>3. API Keys</h2>
          <p>Our service requires you to provide your own API keys for third-party Large Language Models (LLMs). You are solely responsible for the security and management of your API keys. We are not responsible for any loss or misuse of your API keys. All API calls are made from your browser, and keys are stored in your browser's local storage.</p>
          
          <h2>4. Disclaimer of Warranties</h2>
          <p>Our service is provided "as is" and "as available" without any warranties of any kind, either express or implied. We do not warrant that the service will be uninterrupted, error-free, or secure.</p>

          <h2>5. Limitation of Liability</h2>
          <p>In no event shall Lobasters be liable for any indirect, incidental, special, consequential, or punitive damages, including but not limited to, loss of profits, data, or other intangibles, arising out of or in connection with your use of the service.</p>

          <h2>6. Changes to Terms</h2>
          <p>We reserve the right to modify these Terms at any time. We will provide notice of any changes by posting the new Terms on this page.</p>
          
          <h2>7. Contact Us</h2>
          <p>If you have any questions about these Terms, please contact us via our official social media channels.</p>
          
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
