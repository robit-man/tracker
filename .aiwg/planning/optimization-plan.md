# Browser lifetime optimization plan

1. Preserve the original HTML and launch actual idle/seeder/ETV wall-clock runs.
2. Reproduce unbounded work with pinned SDKs and deterministic blocked transports.
3. Repair ownership, single-flight starts, native byte/count admission, generation
   fences, heartbeats and bounded deduplication without evicting durable records.
4. Dispose obsolete media/model work and restore suspended room/global runtimes.
5. Compare full browser soaks and separately exercise healthy RTC playback, public
   screen routes, source recovery, lifecycle and storage regressions.
6. Validate the observed native quota retry fault on the exact final source and
   retain the diff from the hour-long core snapshot.

Acceptance: bounded work under slow/failing routes, no crash/freeze in the stated
observation interval, recovered sources/runtimes, and healthy-link playback above
its dynamic lower band. Public delivery failures and finite-duration limits remain
explicit; passing one hour does not establish years of availability.
