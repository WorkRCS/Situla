import Link from "next/link";

export const metadata = {
  title: "Copyright & Content Policy",
  description: "Situla's copyright, third-party playback, and content concern information."
};

const COPYRIGHT_EMAIL = "an0-my1@proton.me";

export default function CopyrightPolicyPage() {
  return (
    <main className="copyright-page">
      <div className="copyright-page-inner">
        <Link href="/" className="copyright-back-link">
          <span aria-hidden="true">←</span> Back to Situla
        </Link>

        <header className="copyright-hero">
          <p className="copyright-eyebrow">SITULA · SITE INFORMATION</p>
          <h1>Copyright &amp; Content Policy</h1>
          <p>
            This page explains how Situla presents catalog information and third-party playback,
            and how copyright owners can contact us about a concern.
          </p>
        </header>

        <article className="copyright-policy-card">
          <section>
            <h2>1. Our role</h2>
            <p>
              Situla is a discovery interface for movies, television series, and anime. We may display
              catalog information such as titles, identifiers, descriptions, artwork references, episode
              details, and viewing progress to help users navigate the catalog.
            </p>
          </section>

          <section>
            <h2>2. Video hosting and playback</h2>
            <p>
              Situla does not upload, operate a video-file hosting service for, or store complete
              movie, television-episode, or anime video files in its own database or on its own servers
              for playback. Video playback is presented through embedded players or services operated
              by third parties. Those third parties control the streams they make available and their
              own delivery, availability, and service terms.
            </p>
            <p>
              Catalog metadata and playback progress are separate from the underlying video files.
              This statement concerns full-length video files; it does not mean that Situla stores no
              media-related metadata or references.
            </p>
          </section>

          <section>
            <h2>3. Ownership and third-party services</h2>
            <p>
              Situla does not claim ownership of third-party movies, television series, anime, soundtracks,
              artwork, or other copyrighted material displayed or made accessible through an external
              service. Copyright and other intellectual-property rights remain with the respective
              copyright owners or authorized licensees.
            </p>
            <p>
              Embedded services are independent third parties. Situla does not operate or control their
              servers and cannot independently guarantee the authorization, accuracy, or continued
              availability of every item they may deliver. Users may be directed to third-party domains
              when playback is opened.
            </p>
          </section>

          <section>
            <h2>4. Reporting a copyright concern</h2>
            <p>
              A copyright owner or an authorized representative who believes that a Situla page or an
              embedded reference concerns material used without authorization may contact us at:
            </p>
            <p className="copyright-contact">
              <a href={"mailto:" + COPYRIGHT_EMAIL + "?subject=Copyright%20Concern%20%E2%80%94%20Situla"}>
                {COPYRIGHT_EMAIL}
              </a>
            </p>
            <p>Please include enough information for us to identify and review the concern:</p>
            <ul>
              <li>Your full name, contact information, and the rights holder or organization you represent.</li>
              <li>Identification of the copyrighted work and an explanation of your ownership or authority to act.</li>
              <li>The exact Situla page URL(s) where the relevant title, player, or reference appears.</li>
              <li>The specific material or location you are concerned about and why you believe its use is unauthorized.</li>
              <li>Any relevant supporting information, and a statement that the information in your notice is accurate to the best of your knowledge.</li>
            </ul>
            <p>
              We will review sufficiently detailed notices and, where appropriate and within our control,
              may remove or restrict the relevant Situla page, catalog reference, or embedded access.
              Situla cannot directly remove a video file hosted on an independent third-party server;
              rights holders may also need to contact the service operating that server.
            </p>
          </section>

          <section>
            <h2>5. Important information</h2>
            <p>
              This policy is provided for transparency and does not constitute legal advice. A notice,
              disclaimer, or statement that a video is provided by a third party does not by itself
              determine whether a particular use is lawful or remove any legal obligations. Applicable
              rules can depend on the facts and the jurisdictions involved.
            </p>
            <p>
              For formal legal advice or to assess a specific claim, please consult a qualified legal
              professional in the relevant jurisdiction.
            </p>
          </section>
        </article>

        <p className="copyright-page-updated">Copyright enquiries: <a href={"mailto:" + COPYRIGHT_EMAIL}>{COPYRIGHT_EMAIL}</a></p>
      </div>
    </main>
  );
}
