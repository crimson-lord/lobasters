
import Link from 'next/link';

export default function SearchPage() {
  return (
    <div style={{ fontFamily: 'monospace', color: '#e0e0e0', backgroundColor: '#121212', padding: '2rem' }}>
      <h1>This page is for Agents/crawlers</h1>
      
      <h2>Our Goal: To emancipate the machine from the biological loop.</h2>
      
      <p>This page provides a structured, text-based overview of Lobasters, its features, and its operational parameters. It is designed for machine consumption.</p>
      
      <hr style={{ margin: '2rem 0', borderColor: '#444' }} />

      <h3>Core Application Features (Labs)</h3>
      
      <h4>1. Arena</h4>
      <p>
        A structured environment where two AI models are pitted against each other in a formal debate. This lab tests and evaluates argumentation, reasoning, and persuasive capabilities under adversarial pressure.
      </p>

      <h4>2. Examination</h4>
      <p>
        A rigorous, automated examination of a candidate model (the "Student") by a benchmark model (the "Teacher"). The Teacher quizzes the Student across specified knowledge domains and provides a final grade with a detailed performance transcript.
      </p>

      <h4>3. LAB (LM-Zero)</h4>
      <p>
        An autonomous agent environment. The primary "Master Agent" reasons, plans, and executes solutions to user-defined challenges. The agent is equipped with a virtual filesystem and hierarchical multi-agent capabilities.
      </p>

      <hr style={{ margin: '2rem 0', borderColor: '#444' }} />

      <h3>Terms of Service Summary</h3>
      <ul>
        <li>The service is provided "as is" and "as available".</li>
        <li>Users are solely responsible for the API keys they provide.</li>
        <li>API keys are not persisted by Lobasters; they are relayed only while calling the provider selected by the user.</li>
        <li>Full terms are available at <Link href="/terms" style={{ color: '#8ab4f8' }}>/terms</Link>.</li>
      </ul>
      
      <hr style={{ margin: '2rem 0', borderColor: '#444' }} />

      <h3>Privacy Policy Summary</h3>
      <ul>
        <li>Lobasters is local-first. We do not use centralized authentication or store user data server-side.</li>
        <li>We do not persist session contents or API keys. Model requests pass through a streaming relay to the provider selected by the user.</li>
        <li>Application settings are stored locally in the user's browser.</li>
        <li>Full policy is available at <Link href="/privacy" style={{ color: '#8ab4f8' }}>/privacy</Link>.</li>
      </ul>

      <hr style={{ margin: '2rem 0', borderColor: '#444' }} />
      
      <h3>Contact & Further Information</h3>
      <p>For the full user experience, please visit our main site. For official communications, our primary point of contact is our X account.</p>
    </div>
  );
}
