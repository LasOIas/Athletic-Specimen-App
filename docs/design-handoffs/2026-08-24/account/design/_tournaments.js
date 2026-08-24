/* ATHLETIC SPECIMEN — the tournaments the canvas can switch between.
   Round 2026-08-24 — "this is not part of the tournament": picking September
   left August's numbers, August's needs-you list and August's row states on
   screen. The tournament is the source of truth for every one of those, so it
   lives in one table and the canvas stamps it into whatever screen is showing.

   Not app data - canvas fixtures, the same way the screens carry copy. */
window.AS_TOURNAMENTS = {
  't-aug': {
    name: 'August 2026 Tournament',
    meta: 'Sat Aug 22 · <b>registration open</b> · 6 of 12 teams',
    when: '<b>Sat Aug 22</b> · 10:00 AM · Washington Park · 4s co-ed · $80 a team',
    stats: '6|4/6|3|0/18',
    phase: 1,
    needs: [
      { n: "2 of 6 teams haven't paid", s: 'Block Party · Dig Deep — the other 4 are paid', act: 'See who paid', view: 'teams' },
      { n: "Pools aren't drawn", s: '6 teams in, 3 nets ready — drawing takes a second', act: 'Draw', go: true, view: 'pools' }
    ],
    rows: {
      registration: { sub: '<span class="mgt-on">Open</span> · closes Fri Aug 21 · what players see', meta: 'Open' },
      teams: { sub: '6 registered · 2 unpaid · rosters and buy-in', meta: '2 unpaid' },
      pools: { sub: 'Not drawn · 2 pools of 6 across 3 nets', meta: 'To do' },
      scoresheet: { sub: 'Enter pool results as each game finishes' },
      bracket: { sub: 'Double elimination · opens when pool play finishes', meta: 'Locked' },
      checkin: { sub: 'Opens Sat 9:30 AM · 0 of 24 players in', meta: 'Opens Sat' },
      closeout: { sub: 'Crowns the champion and archives the event', meta: 'Not yet' }
    }
  },
  't-sep': {
    name: 'September 2026 Tournament',
    meta: 'Sat Sep 19 · <b class="is-off">not open yet</b> · 0 teams',
    when: '<b>Sat Sep 19</b> · 10:00 AM · Washington Park · 4s co-ed · $80 a team',
    stats: '0|0/0|3|0/18',
    phase: 0,
    needs: [
      { n: "Sign-ups aren't open", s: 'Nothing is public until you open them', act: 'Open', go: true, view: 'registration' }
    ],
    rows: {
      registration: { sub: 'Not open yet · players cannot sign up', meta: 'Closed' },
      teams: { sub: 'Nobody registered yet · rosters and buy-in', meta: '0 teams' },
      pools: { sub: 'Waiting on teams · 3 nets ready', meta: 'Waiting' },
      scoresheet: { sub: 'Opens once pools are drawn' },
      bracket: { sub: 'Double elimination · opens when pool play finishes', meta: 'Locked' },
      checkin: { sub: 'Opens Sep 19, 9:30 AM · 0 of 24 players in', meta: 'Not yet' },
      closeout: { sub: 'Crowns the champion and archives the event', meta: 'Not yet' }
    }
  },
  't-jul': {
    name: 'July 2026 Tournament',
    meta: 'Sat Jul 18 · <b class="is-off">finished</b> · 12 teams',
    when: '<b>Sat Jul 18</b> · 10:00 AM · Washington Park · 4s co-ed · $80 a team',
    stats: '12|12/12|3|18/18',
    phase: 5,
    needs: [],
    rows: {
      registration: { sub: 'Closed · 12 teams signed up', meta: 'Closed' },
      teams: { sub: '12 registered · all paid', meta: 'All paid' },
      pools: { sub: 'Done · 2 pools of 6 across 3 nets', meta: 'Done' },
      scoresheet: { sub: 'All 18 pool games recorded' },
      bracket: { sub: 'Net Gains won · double elimination', meta: 'Champion' },
      checkin: { sub: 'Closed · 24 of 24 players checked in', meta: 'Done' },
      closeout: { sub: 'Archived Jul 18 · Net Gains crowned', meta: 'Done' }
    }
  }
};
