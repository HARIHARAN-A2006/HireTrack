# HireTrack setup and deployment guide

This guide walks through setting up this exact project on Windows, from required downloads to a public deployment. Follow it in order. You do not need to write code for the setup steps.

## What you are setting up

- **Your computer:** runs the website while you work on it.
- **Supabase:** stores accounts and placement data online. It provides the database and sign-in service, so you do not need to install PostgreSQL or set up a separate backend server.
- **GitHub:** stores a copy of the project code.
- **Vercel:** publishes the Next.js website and its API routes to the internet.

The website and API are already in this project. The database migration is also prepared. The work remaining is to connect them to your Supabase project, create accounts, push the code to GitHub, and publish it with Vercel.

## Part 1: Install the tools

You need Node.js, pnpm, and Git. Use the official download pages below.

### 1. Install Node.js

1. Open the [official Node.js download page](https://nodejs.org/en/download/).
2. Choose the **LTS** Windows installer. Avoid the button marked **Current**.
3. Open the downloaded installer and accept the standard options.
4. When installation finishes, close and reopen PowerShell so it can find Node.js.

### 2. Install pnpm

This project uses pnpm. Node.js installs `npm`, which we will use to install pnpm.

1. Open **Windows PowerShell** from the Start menu.
2. Paste this command and press Enter:

   ```powershell
   npm install --global pnpm@11.19.0
   ```

3. Wait for it to finish. If Windows says it cannot find `npm`, restart PowerShell. If it still cannot find `npm`, restart your computer and try again.

### 3. Install Git

1. Open the [official Git for Windows page](https://git-scm.com/install/windows).
2. Download and install Git for Windows. The normal default installer selections are fine.
3. Close and reopen PowerShell after installation.

### 4. Confirm the tools are installed

In PowerShell, run each command. Each should print a version instead of an error:

```powershell
node --version
npm --version
pnpm --version
git --version
```

If `node`, `npm`, or `pnpm` is still “not recognized,” restart Windows once and repeat these commands.

## Part 2: Install and run HireTrack on your computer

1. Open PowerShell.
2. Go to the project folder:

   ```powershell
   Set-Location D:\HireTrack
   ```

3. Install the project packages:

   ```powershell
   pnpm install
   ```

   Wait for the command to finish and return to the prompt.

4. Start the website:

   ```powershell
   pnpm dev
   ```

5. Open [http://localhost:3000](http://localhost:3000) in your browser. You should see the HireTrack placement dashboard.
6. Keep the PowerShell window open while using the local website. To stop it, click that window and press **Ctrl+C**. To start it again, run `pnpm dev` from `D:\HireTrack`.

At this point the dashboard is in **demo mode**. The sample content is for preview only. Demo changes are not saved. The next parts connect real storage.

## Part 3: Create the Supabase project

1. Open [supabase.com](https://supabase.com/) and create an account or sign in.
2. Create a new project from the dashboard.
3. Choose or create an organization, then name the project `hiretrack`.
4. Choose a database password. Save it somewhere private; you will not need to put it in the website code.
5. Select a region near you. Choose the Free plan if it is available for your account and project.
6. Create the project and wait until the dashboard says it is ready.

You do not need to download PostgreSQL, Docker, or the Supabase command-line tool for this dashboard-based setup.

## Part 4: Create the HireTrack database tables

1. In the Supabase dashboard, open the `hiretrack` project.
2. Select **SQL Editor** in the left menu.
3. Choose **New query**.
4. On your computer, open this file in a text editor: [0001_initial_schema.sql](</D:/HireTrack/supabase/migrations/0001_initial_schema.sql>).
5. Select all the text in that file and copy it.
6. Return to Supabase, paste the SQL into the new query, and click **Run**.
7. Wait for the success message. The file creates the user, student, company, job, application, interview, event-history, and audit tables, along with access rules.

Run this migration once in a new project. If Supabase displays an error, stop and copy the exact error text; do not repeatedly run the entire migration, because database types and triggers may already have been created.

### Add recruiter, messaging, and interview workflows

1. In Supabase SQL Editor, choose **New query**.
2. Open [0002_recruiter_workflows.sql](</D:/HireTrack/supabase/migrations/0002_recruiter_workflows.sql>) on your computer, copy all of its contents, and paste it into the query.
3. Click **Run** once and wait for the success result. This adds company-scoped recruiters, recruiter assignments, private interview notes and candidate-visible feedback, application messages, and saved activity records.
4. If you already ran `0001_initial_schema.sql` and it reported that `app_role` exists, **do not run 0001 again**. Run only `0002` now. If `0002` reports a missing table or function, stop and share the complete error before continuing.

### Add account and placement activity audit records

1. In Supabase SQL Editor, choose **New query**.
2. Open [0003_audit_and_job_search.sql](</D:/HireTrack/supabase/migrations/0003_audit_and_job_search.sql>), copy all its contents, and paste into the new query.
3. Click **Run** once. This records sign-ins, job posting/status changes, interview updates, and sent messages, and limits the full audit view to placement officers.
4. Run `0003` only after `0002` has completed successfully. If `0001` and `0002` were already run, apply only `0003`.

## Part 5: Set the sign-in URLs in Supabase

This lets account-confirmation links return to your local website.

1. In Supabase, open **Authentication**.
2. Find **URL Configuration** (sometimes shown in the Auth settings area).
3. Set **Site URL** to:

   ```text
   http://localhost:3000
   ```

4. Add this to the allowed **Redirect URLs** list:

   ```text
   http://localhost:3000/**
   ```

5. Save the settings.

Supabase uses the Site URL and allowed redirect list for email confirmation and sign-in redirects. [Supabase redirect URL instructions](https://supabase.com/docs/guides/auth/redirect-urls)

## Part 6: Connect your local HireTrack app to Supabase

1. In PowerShell, go to the project folder if you are not already there:

   ```powershell
   Set-Location D:\HireTrack
   ```

2. Make a private settings file by copying the example:

   ```powershell
   Copy-Item .env.example .env.local
   ```

3. Open that private file in Notepad:

   ```powershell
   notepad .env.local
   ```

4. In Supabase, open the project’s **Connect** dialog or **Settings → API Keys**. Copy the **Project URL** and **publishable key**. Supabase currently recommends publishable keys for browser apps; never use a secret key here. A secret key bypasses row-level security. [Supabase key guidance](https://supabase.com/docs/guides/getting-started/api-keys)
5. In Notepad, replace the example values so the file looks like this, using your actual values:

   ```env
   NEXT_PUBLIC_SUPABASE_URL=https://your-project-ref.supabase.co
   NEXT_PUBLIC_SUPABASE_ANON_KEY=sb_publishable_your_actual_key
   ```

   Keep the variable names exactly as shown. Put the publishable key value in the line named `NEXT_PUBLIC_SUPABASE_ANON_KEY`; that is the name this version of the app reads.

6. Save the file and close Notepad. Do not send the key in a message or add `.env.local` to GitHub. The project’s `.gitignore` already excludes `.env.local`.
7. If `pnpm dev` is currently running, click the PowerShell window and press **Ctrl+C** to stop it.
8. Start the app again:

   ```powershell
   pnpm dev
   ```

9. Refresh [http://localhost:3000](http://localhost:3000). The app should now use Supabase instead of demo mode.

If it still looks like the demo, verify that the file is named exactly `.env.local` (not `.env.local.txt`), that it is in `D:\HireTrack`, and that you restarted the app after saving it.

## Part 7: Create a student account

1. In the browser, open [http://localhost:3000/login](http://localhost:3000/login).
2. Choose **Create an account**.
3. Enter your name, Hariharan, your email address, and a password with at least 8 characters.
4. Submit the form.
5. If Supabase sends a confirmation email, open it and click its confirmation link. Then return to the local website and sign in.
6. The student page should open. Select **Edit profile** and enter:
   - Full name: `Hariharan`
   - University: `BHARATH INSTITUTE OF HIGHER EDUCATION AND RESEARCH`
   - Your degree, graduation year, and skills
7. Click **Save profile**. Refresh the page and confirm the profile remains saved.

This account is a **student** account by default.

## Part 8: Create the placement officer account

The database starts new accounts as students. Make a second account for the officer so the two roles can be demonstrated separately.

1. Sign out of the student account.
2. Open `/login` and create another account using a different email address. Confirm the email if prompted.
3. In Supabase, open **SQL Editor → New query**.
4. Paste the command below, replacing the example email with the exact email used for the officer account:

   ```sql
   update public.profiles
   set role = 'officer'
   where email = 'officer@example.edu';
   ```

5. Click **Run**. Supabase should report that one row was updated. If it says zero rows, check the email spelling and make sure the officer account registered successfully.
6. Sign out from the website and sign in with the officer email. The placement dashboard should open. If it still opens the student page, sign out and back in once more so the app reloads the updated role.

## Part 9: Add sample jobs

This is optional. Skip it if you want to create your own job from the officer dashboard.

1. Make sure the officer role update from Part 8 succeeded.
2. In Supabase **SQL Editor**, choose **New query**.
3. Open [seed.sql](</D:/HireTrack/supabase/seed.sql>) in a text editor, copy all its contents, paste them in Supabase, and click **Run**.
4. Sign in as a student and confirm the two sample jobs appear.

Run this seed script only once; running it again creates another sample company and another pair of jobs.

## Part 10: Check both user flows

### Student check

1. Sign in with the student account.
2. Open a published opportunity and click **Apply**.
3. Confirm the application stage appears under **Progress so far**.
4. Refresh the page. The application should still be there.
5. Edit and save the student profile.
6. Enter a GitHub username and select **Find profile**. The app should show public profile and repository information.

### Officer check

1. Sign out and sign in with the officer account.
2. Select **Post an opportunity**, fill in the role, company, work type, and location, and publish it.
3. Open the recent applications table and use a candidate’s stage menu to move an application through **Applied → Screening → Interview** (or later stages).
4. Refresh the page. The stage should remain updated.
5. Sign in as a student and confirm that the officer dashboard is not available to that account.

If there are no candidates yet, first apply to one of the jobs as the student account.

### Recruiter check

1. Sign out of the student account and use **Create an account** to register a separate account for the company recruiter.
2. Sign back in as the placement officer.
3. Open **Recruiter access** from the placement dashboard, select the company, enter the recruiter account email, and select **Assign recruiter**.
4. Sign out, then sign in using the recruiter account. HireTrack should open its recruiter workspace.
5. Confirm the recruiter sees only applicants to jobs for the assigned company. Use the company-opportunities panel to post or close a role.
6. Schedule an interview with a meeting link. Add a private recruiter note and separate candidate feedback.
7. Open a candidate conversation and send a message. Sign in as the student and confirm the message and any candidate feedback are visible in their account.
8. Return to the officer account and remove the recruiter's company access from **Recruiter access**. Confirm the recruiter no longer sees those candidates or company roles.

## Part 11: Put the code on GitHub

The project folder is not a Git repository yet, so do this once.

1. Create or sign in to a GitHub account.
2. Open [github.com/new](https://github.com/new).
3. Name the repository `hiretrack`.
4. Choose **Public** if your class needs to view the code, or **Private** if you want to restrict who can see it.
5. Leave **Add a README**, **Add .gitignore**, and **Choose a license** unchecked. The project already has a README and `.gitignore`.
6. Click **Create repository**. Keep the page open so you can copy the repository URL.
7. Open PowerShell and run:

   ```powershell
   Set-Location D:\HireTrack
   git init -b main
   git add .
   git status
   ```

8. Review the `git status` output. It should list project files to commit. It must **not** list `.env.local`, `node_modules`, or `.next`.
9. Save the first version:

   ```powershell
   git commit -m "Build HireTrack placement platform"
   ```

   If Git asks who you are, use the name and email associated with your GitHub account:

   ```powershell
   git config --global user.name "Hariharan"
   git config --global user.email "YOUR_GITHUB_EMAIL"
   ```

   Then repeat the commit command.

10. Connect the local folder to the GitHub repository. Replace the sample URL with the URL GitHub showed you:

   ```powershell
   git remote add origin https://github.com/YOUR_GITHUB_USERNAME/hiretrack.git
   git push -u origin main
   ```

11. If Git asks you to sign in, follow the browser sign-in window. Refresh the GitHub repository page; you should see the HireTrack files. [GitHub repository creation guide](https://docs.github.com/en/repositories/creating-and-managing-repositories/creating-a-new-repository)

## Part 12: Publish the website with Vercel

The frontend and API are both in this Next.js project, so Vercel publishes them together. You do not need a separate Render account or API server.

1. Open [vercel.com](https://vercel.com/) and sign in using GitHub.
2. Choose **Add New… → Project** (or **New Project**).
3. Find the `hiretrack` GitHub repository and choose **Import**. If it is missing, use the GitHub account selector or grant Vercel access to that repository.
4. On the project configuration page, confirm:
   - Framework preset: **Next.js**
   - Root directory: `./` (the repository root)
   - Build command and output settings: leave the defaults
5. Open **Environment Variables** and add the same two names and values that are in `.env.local`:
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
6. Choose the Production, Preview, and Development environments if Vercel asks where each variable should apply.
7. Click **Deploy** and wait for the build to finish.
8. Open the Vercel URL when it appears. The app should load with real Supabase data. Vercel can create deployments from a connected Git repository and lets you configure the project root and environment variables during setup. [Vercel Git deployment](https://vercel.com/docs/git)

## Part 13: Allow the deployed URL in Supabase

1. Copy the Vercel URL, for example `https://hiretrack-yourname.vercel.app`.
2. Return to Supabase → **Authentication → URL Configuration**.
3. Change **Site URL** from the local URL to your actual Vercel URL.
4. Add this to the allowed Redirect URLs list, replacing the example domain:

   ```text
   https://hiretrack-yourname.vercel.app/**
   ```

5. Keep the local redirect URL too:

   ```text
   http://localhost:3000/**
   ```

6. Save the settings.
7. Test sign-in, sign-up, and email confirmation from the deployed Vercel URL.

If you change a Vercel environment variable later, redeploy the project so the new value is included in the deployment.

## Part 14: Final presentation checklist

- [ ] Student can register and sign in.
- [ ] Student profile displays Hariharan and the correct college.
- [ ] Student can browse published jobs and apply once to a job.
- [ ] Student can enrich the profile from GitHub.
- [ ] Application is still present after refreshing the page.
- [ ] Officer can create a job and update application stages.
- [ ] Placement officer can assign a company recruiter; recruiter data is limited to assigned companies.
- [ ] Recruiter can manage company opportunities, review applicants, schedule interviews, and write internal notes.
- [ ] Candidate can see only feedback intended for them and message the placement/recruiting team.
- [ ] Application status and conversation persist after signing out and back in.
- [ ] Password reset works using the account email.
- [ ] The student account cannot use officer-only actions.
- [ ] The app works from the public Vercel URL.
- [ ] README, screenshots, API routes, and database relationship diagram are ready for submission.

## If something goes wrong

| What you see | What to check |
| --- | --- |
| `pnpm` or `npm` is not recognized | Install Node.js LTS and pnpm, then close and reopen PowerShell. |
| Browser says it cannot reach `localhost:3000` | Start the app with `pnpm dev` from `D:\HireTrack`; keep that PowerShell window open. |
| Dashboard asks you to connect Supabase | Confirm `.env.local` exists directly inside `D:\HireTrack`, check both variable names, save the file, and restart `pnpm dev`. |
| Supabase says invalid API key | Copy the **publishable** key for the same Supabase project whose URL you entered. Do not copy the secret key. |
| Student sees no jobs | Sign in as officer and run `supabase/seed.sql`, or publish a job from the officer dashboard. |
| Officer sees the student portal | Recheck the officer email in the role-update SQL, then sign out and sign in again. |
| Vercel says a variable is missing | Add both Supabase variables in Vercel project settings and redeploy. |
| Login or confirmation returns to the wrong page | Check Supabase Site URL and Redirect URLs against your exact local or Vercel URL. |
| Recruiter sees no company or candidate data | Confirm migration `0002_recruiter_workflows.sql` completed and the officer assigned the recruiter's registered email to the correct company. |
| Student cannot start a conversation | Assign a recruiter to the company or make sure a placement officer account exists; a contact must be assigned to the application. |

## Official downloads and references

- [Node.js LTS download](https://nodejs.org/en/download/)
- [pnpm installation](https://pnpm.io/installation/)
- [Git for Windows installation](https://git-scm.com/install/windows)
- [Supabase API keys](https://supabase.com/docs/guides/getting-started/api-keys)
- [Supabase authentication redirect URLs](https://supabase.com/docs/guides/auth/redirect-urls)
- [GitHub: create a repository](https://docs.github.com/en/repositories/creating-and-managing-repositories/creating-a-new-repository)
- [Vercel: deploy from Git](https://vercel.com/docs/git)
