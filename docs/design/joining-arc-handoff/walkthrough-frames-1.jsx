/* Walkthrough frames 1–5 — exact copies of the approved onboarding finals
   (group-creation.html) and the join screen (join-screen.html). */

function Status() {
  return (
    <div className="statusbar">
      <span>9:41</span>
      <div className="dots"><span></span><span></span><span></span><div className="battery"></div></div>
    </div>);
}
function HomeBar() { return <div className="home-ind"><i></i></div>; }
function OrbitFace() { return <span className="orbit-mark" dangerouslySetInnerHTML={{ __html: window.OrbitMark.svg(72) }} />; }
function Arrow() {
  return <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12h14M13 6l6 6-6 6" /></svg>;
}
function Chev() {
  return <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M15 6l-6 6 6 6" /></svg>;
}

function S2Header({ step, back }) {
  return (
    <div className="s2-top">
      {back && <div className="s2-back"><Chev /></div>}
      <div className="s2-av"><OrbitFace /></div>
      <div>
        <div className="nm">Orbit</div>
        <div className="step">{step || 'Step 2 of 3'}</div>
      </div>
    </div>);
}

function S2rOrbitMsg({ text, light, solo }) {
  return (
    <div className="s2r-msgrow">
      {!solo && <div className="s2r-msgav"><OrbitFace /></div>}
      <div className={"s2r-msg" + (light ? " s3-msg-light" : "") + (solo ? " s2r-msg-tail" : "")}>{text}</div>
    </div>);
}

function IconGlobe() {
  return <svg className="glb" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="9" /><path d="M3 12h18M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18" /></svg>;
}
function IconShareUp() {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round"><path d="M12 15V4M8 8l4-4 4 4" /><path d="M5 12v6a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-6" /></svg>;
}

/* ===== 01 · Step 1 — describe your group (final, with name field) ===== */
function WalkS1() {
  return (
    <div className="phone">
      <Status />
      <div className="s2-body">
        <S2Header step="Step 1 of 3" />
        <div className="s2-final-scroll">
          <S2rOrbitMsg light solo text="Hey! Tell me about your group and I'll handle the rest." />
          <div className="s1-field">
            <div className="ph">We're a climbing crew of 8. We usually go Monday and Wednesday mornings at 8am. We'd also like to grab beers occasionally.<span className="caret"></span></div>
            <div className="count">0 / 500</div>
          </div>
          <div className="s1-namelab">What should the crew call you?</div>
          <div className="s1-name">Jacob</div>
        </div>
        <div className="s1-foot">
          <div className="cta lime">Continue <Arrow /></div>
          <div className="s1-note">Orbit reads this to set your days, send reminders, and build a shared group page.</div>
        </div>
      </div>
      <HomeBar />
    </div>);
}

/* ===== 02 · Step 2 — approved playback (YOU row + tinted footer confirm) ===== */
function WalkS2() {
  return (
    <div className="phone">
      <Status />
      <div className="s2-body">
        <S2Header back />
        <div className="s2-final-scroll">
          <div className="cardX">
            <div className="pad pad-tight">
              <div className="cardX-title">
                <span className="nm">Climbing Crew</span>
              </div>
              <div className="s2-sum">
                <div className="s2-srow"><span className="k">Who</span><span className="v">Climbing crew of 8</span></div>
                <div className="s2-srow"><span className="k">You</span><span className="v">Jacob</span></div>
                <div className="s2-srow"><span className="k">Climbs</span><span className="v">Mon & Wed mornings @ 8am</span></div>
                <div className="s2-srow"><span className="k">Beers</span><span className="v">Now and then, about once a month</span></div>
              </div>
            </div>
            <div className="cfA"><span className="lbl">Looks right, set up invites</span><span className="go"><Arrow /></span></div>
          </div>
          <S2rOrbitMsg light text="That's what I picked up, name and all. Tell me anything you'd like to change and I'll update it above." />
        </div>
        <div className="s2r-pin">
          <div className="s2r-input">
            <span className="ftxt">Message Orbit<span className="caret"></span></span>
            <div className="s2r-send"><Arrow /></div>
          </div>
          <div className="s2r-prompt">e.g. “we also climb Fridays” · “beers are once a month”</div>
        </div>
      </div>
      <HomeBar />
    </div>);
}

/* ===== 03 · Step 2 variant — when Orbit needs more ===== */
function WalkS2Gap() {
  return (
    <div className="phone">
      <Status />
      <div className="s2-body">
        <S2Header back />
        <div className="s2-final-scroll">
          <div className="cardX">
            <div className="pad pad-tight">
              <div className="cardX-title">
                <span className="nm">Climbing Crew</span>
              </div>
              <div className="s2-sum">
                <div className="s2-srow"><span className="k">Who</span><span className="v">Climbing crew of 8</span></div>
                <div className="s2-srow"><span className="k">You</span><span className="v">Jacob</span></div>
                <div className="s2-srow pending"><span className="k">Climbs</span><span className="v">Mon &amp; Wed mornings <span className="s2-gap"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="9"/><path d="M12 8v4l2.5 2.5"/></svg>what time?</span></span></div>
                <div className="s2-srow"><span className="k">Beers</span><span className="v">Now and then, about once a month</span></div>
              </div>
            </div>
          </div>
          <S2rOrbitMsg light text="Here's what I got. One question: what time do you usually climb on Mondays and Wednesdays?" />
        </div>
        <div className="s2r-pin">
          <div className="s2r-input">
            <span className="ftxt">Message Orbit<span className="caret"></span></span>
            <div className="s2r-send"><Arrow /></div>
          </div>
          <div className="s2r-prompt">e.g. “around 9am” · “we start at 7”</div>
        </div>
      </div>
      <HomeBar />
    </div>);
}

/* ===== 04 · Step 3 — invite link (final) ===== */
function WalkS3() {
  return (
    <div className="phone">
      <Status />
      <div className="s2-body">
        <S2Header step="Step 3 of 3" back />
        <div className="s2-final-scroll">
          <div className="cardX">
            <div className="pad pad-tight">
              <div className="cardX-title"><span className="nm">Climbing Crew</span></div>
              <p className="s3-caption">Group invite link</p>
              <div className="s3-link">
                <IconGlobe />
                <span className="url">join.interplanetary.app/climbing-crew</span>
              </div>
              <div className="s3-sharebtn"><IconShareUp /> Share invite link</div>
            </div>
          </div>
          <S2rOrbitMsg light text="Here's your invite link. Send it to anyone you want — they just tap to join, and you can share it again anytime from inside your group. Ready? Head in below." />
        </div>
        <div className="s3-proceedB">
          <div className="btn outline">Take me to my group <Arrow /></div>
          <div className="hint">You can invite people now or anytime later</div>
        </div>
      </div>
      <HomeBar />
    </div>);
}

/* ===== 05 · Join screen ===== */
function WalkJoin() {
  return (
    <div className="phone">
      <Status />
      <div className="jn-body">
        <div className="jn-eyebrow">You're invited</div>
        <div className="jn-msgrow">
          <div className="jn-msgav"><OrbitFace /></div>
          <div className="jn-msg">Hey! I'm Orbit. I keep Climbing Crew running so nobody has to be the organizer.</div>
        </div>
        <div className="jn-card">
          <div className="jn-cardtitle">Climbing Crew</div>
          <div className="jn-rows">
            <div className="jn-row"><span className="k">Who</span><span className="v">8 members</span></div>
            <div className="jn-row"><span className="k">Climbs</span><span className="v">Mon &amp; Wed mornings @ 8am</span></div>
            <div className="jn-row"><span className="k">Beers</span><span className="v">Now and then, about once a month</span></div>
          </div>
        </div>
        <div className="jn-field">
          <div className="jn-input">What should the crew call you?<span className="caret"></span></div>
        </div>
        <div className="jn-primary">
          Join Climbing Crew
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12h14M13 6l6 6-6 6" /></svg>
        </div>
        <div className="jn-reassure">No app to download, no password. You'll land right in the group.</div>
      </div>
      <HomeBar />
    </div>);
}

Object.assign(window, { WalkS1, WalkS2, WalkS2Gap, WalkS3, WalkJoin });
