# Screenshots

Each image ships at 1600x1000 (native crop) and again at 1920x1080 (`@1920x1080` suffix, padded on paper `#F2EFE9`).

- `home.jpg`: The landing page with the step-free trip planning form and the live "33 ADA elevators out right now" outage strip below it.
- `rider-routes.jpg`: The rider view for a Court Sq to Bleecker St trip, showing all three candidate routes with their elevator dependency chips and the native WebMCP tools table registered in the rider window.
- `confirm-card.jpg`: The "AGENT WANTS TO ACT" confirmation card raised by `accept_route`, showing the route summary, risk score, transfers, and elevator status before the rider presses Confirm.
- `companion.jpg`: The inverted black companion-view header band alongside the companion's tools table, which has no `accept_route` or `accept_reroute` tool, only reads and `propose_reroute`/`watch_equipment`/`add_note`.
- `simulated-flip.jpg`: The rider view after simulating an EL328 outage at Bleecker St, showing the F route's score jump to 86 with a struck-through "OUT SIM" elevator chip, while the G-then-F route becomes the new "LOWEST RISK HERE" recommendation.
- `report-form.jpg`: The rider's "Report Broken Equipment" declarative form alongside the tool log, which shows the `accept_route` call and its `{"routeId":"r_bb6b15ed"}` arguments.
