# Using FlareSuite mail in Outlook, Apple Mail and other mail apps

FlareSuite has no mobile app of its own. On your phone, tablet or computer you use the mail app you already
have: Outlook, Apple Mail, Thunderbird, Gmail on Android, Spark and so on. They connect over IMAP (reading) and
SMTP (sending) through the FlareSuite mail gateway.

Mail apps never get your FlareSuite password. They sign in with an **app password**: a 16-letter password that
only works for mail, that you create for each app and can revoke at any time.

## 1. Create an app password

1. In FlareSuite, open **Settings → App passwords**.
2. Click **New app password**, name it after the app or device ("Outlook on my laptop") and click **Create**.
3. Copy the password now; it is shown only once. The page also shows your user name and the server settings.

Create one app password per app or device, so revoking one does not sign the others out. Changing your
FlareSuite password revokes every app password.

## 2. Add the account to your mail app

The **user name** is always your full email address, and the **password** is the app password.

### Outlook (Windows and Mac)

1. On Windows: **File → Add account**. On Mac: **Outlook → Settings → Accounts → +**.
2. Enter your email address. If Outlook asks for the account type, choose **IMAP**.
3. Enter the app password. Outlook usually finds the server settings by itself (FlareSuite publishes
   Autodiscover records); if it asks, use the [server settings](#server-settings) below.

New Outlook for Windows and Outlook on the web sync IMAP accounts through Microsoft's servers; the same settings
work there.

### Apple Mail (iPhone, iPad and Mac)

- **Fastest:** on the device, open the setup profile link shown on the App passwords page (or
  `https://<mail server>/apple/mail.mobileconfig?email=<your address>`), then install it. On iPhone and iPad:
  **Settings → Profile Downloaded → Install**. Enter the app password when asked.
- **By hand:** **Settings → Mail → Accounts → Add Account → Other → Add Mail Account**, choose **IMAP** and
  enter the [server settings](#server-settings). On Mac: **Mail → Add Account → Other Mail Account**.

iOS ignores autoconfiguration records, so on iPhone and iPad either install the profile or type the settings.

### Thunderbird

**Account Settings → Account Actions → Add Mail Account.** Enter your name, email address and the app password;
Thunderbird finds the rest (FlareSuite publishes autoconfig records).

### Other apps (Gmail on Android, Spark, …)

Add an **IMAP** (sometimes called "Other") account and enter the server settings below.

## Server settings

| | Server | Port | Security |
|---|---|---|---|
| Incoming (IMAP) | the mail server shown on the App passwords page (`mail.flaresuite.ai` on FlareSuite Cloud) | 993 | SSL/TLS |
| Outgoing (SMTP) | the same server | 465 | SSL/TLS (or 587 with STARTTLS) |

User name: your full email address. Password: the app password, for both incoming and outgoing mail.

## Good to know

- **Sent mail:** FlareSuite already keeps a copy of everything you send, so apps that also save a copy to
  *Sent* do not create duplicates.
- **Drafts** you save in the app appear in FlareSuite's Drafts, and the other way round.
- **Shared mailboxes** you have access to appear as folders under `Shared/<address>/`.
- **Folders** can be created in the app at the top level; rename and delete them in FlareSuite on the web.
- **Revoking access:** Settings → App passwords → **Revoke**. The app is signed out at its next connection.

## Troubleshooting

- *"Wrong password"*: use the app password, not your FlareSuite password, and the full email address as the user
  name. Spaces in the app password do not matter.
- *Outlook or Apple Mail cannot find the server*: type the server settings by hand (Apple Mail on iPhone always
  needs the profile or manual settings).
- *Too many failed sign-ins*: the gateway pauses sign-ins after repeated failures; wait 15 minutes and try again
  with a new app password.
