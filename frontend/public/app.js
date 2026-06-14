console.log('[app.js] loader loaded, readyState=', document.readyState);
(function () {
  var scripts = [
    '/app_bootstrap.js',
    '/app_dashboard.js',
    '/app_system.js',
    '/app_juniper.js',
    '/app_services.js',
    '/app_data_modules.js',
    '/app_runtime_core.js',
    '/app_network_events.js',
    '/app_dbman_events.js',
    '/app_security_events.js',
    '/app_apiman_events.js',
    '/app_tools_capture.js',
    '/app_firewall_helpers.js',
    '/app_menu.js'
  ];

  function loadScript(src) {
    return new Promise(function (resolve, reject) {
      var script = document.createElement('script');
      script.src = src;
      script.async = false;
      script.onload = resolve;
      script.onerror = function () { reject(new Error('Failed to load ' + src)); };
      document.head.appendChild(script);
    });
  }

  scripts.reduce(function (chain, src) {
    return chain.then(function () { return loadScript(src); });
  }, Promise.resolve()).catch(function (err) {
    console.error('[app.js] split loader failed', err);
  });
})();
