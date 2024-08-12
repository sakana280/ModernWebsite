# About
This is a self-learning exercise and example of how to build a modern website/webapp with offline capability.

# TODO
- [x] Store to localstorage
- [x] Sync to backend https://developer.mozilla.org/en-US/docs/Web/API/Background_Synchronization_API and backend efcore store in sqlite
- [x] Load from backend (replacing localstorage) on page load
- [ ] Load from backend (replacing localstorage) on remote update
  - [ ] via push events https://blog.elmah.io/how-to-send-push-notifications-to-a-browser-in-asp-net-core/
  - [ ] or via SingalR?
- [ ] PWA offer/insist on installation
- [ ] Hashed bundling https://learn.microsoft.com/en-us/aspnet/core/client-side/bundling-and-minification?view=aspnetcore-8.0
- [ ] Refresh cache as needed
- [ ] Update worker service and app components
- [ ] Authentication

# Questions
- How much workbox functionality to use? https://developer.chrome.com/docs/workbox
- Use this for message passing instead of workbox-window ? https://github.com/bevacqua/swivel
- Would offline caching be simplified by UpUp https://github.com/TalAter/UpUp, 
eg versioning https://github.com/TalAter/UpUp/blob/master/docs/README.md#cache-versions
Can its SW can be extended with other functionality?
