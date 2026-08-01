import './Page.css'
import './PrivacyPolicy.css'

function PrivacyPolicy() {
  return (
    <section className="page privacy">
      <header className="page__header">
        <h1 className="page__title">Privacy Policy</h1>
        <p className="page__subtitle">How we handle your data for the iOS app.</p>
      </header>

      <article className="page__section privacy__content">
        <h2 className="page__section-title">Overview</h2>
        <p>
          This Privacy Policy describes how Dominion Setup Assistant (the “App”) handles
          information.
        </p>

        <section aria-labelledby="no-data-collection" className="page__section">
          <h3 id="no-data-collection" className="page__section-title">No Data Collection</h3>
          <p>
            Dominion Setup Assistant does not collect, store, transmit, or share any personal
            information or other user data.
          </p>
          <p>The App does not:</p>
          <ul>
            <li>Collect personal information</li>
            <li>Track users or their activity</li>
            <li>Use analytics or advertising services</li>
            <li>Access contacts, photos, location, or other sensitive device information</li>
            <li>Create user accounts</li>
            <li>Send data to external servers</li>
          </ul>
        </section>

        <section aria-labelledby="third-party-services" className="page__section">
          <h3 id="third-party-services" className="page__section-title">Third-Party Services</h3>
          <p>
            The App does not use third-party libraries, services, or SDKs that collect user data.
          </p>
        </section>

        <section aria-labelledby="data-stored-on-device" className="page__section">
          <h3 id="data-stored-on-device" className="page__section-title">Data Stored on Your Device</h3>
          <p>
            The App may store information locally on your device as necessary for the App's
            functionality. This information is not transmitted to the developer or any third party.
          </p>
        </section>

        <section aria-labelledby="childrens-privacy" className="page__section">
          <h3 id="childrens-privacy" className="page__section-title">Children’s Privacy</h3>
          <p>
            Because the App does not collect any personal information, it does not knowingly collect
            information from children or any other users.
          </p>
        </section>

        <section aria-labelledby="changes" className="page__section">
          <h3 id="changes" className="page__section-title">Changes to This Privacy Policy</h3>
          <p>
            If the App's data practices change, this Privacy Policy may be updated to reflect those
            changes. Any updated version will be posted on this page with a revised effective date.
          </p>
        </section>

        <section aria-labelledby="contact" className="page__section">
          <h3 id="contact" className="page__section-title">Contact</h3>
          <p>
            If you have questions about this Privacy Policy, you may contact the developer at:
          </p>
          <p>
            <a href="mailto:proskin.david@gmail.com">proskin.david@gmail.com</a>
          </p>
        </section>
      </article>
    </section>
  )
}

export default PrivacyPolicy
