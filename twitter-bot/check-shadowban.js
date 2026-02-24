/**
 * Shadowban Checker - Checks if account is still restricted
 */
const TwitterBrowser = require('../src/twitter/twitter-browser');

(async () => {
  const tw = new TwitterBrowser();
  await tw.init();
  
  await tw.page.goto('https://x.com/daiarticle', { waitUntil: 'domcontentloaded' });
  await tw.page.waitForTimeout(5000);
  
  const text = await tw.page.$eval('body', b => b.innerText);
  const isRestricted = text.includes('temporarily restricted') || text.includes('Caution');
  
  if (!isRestricted) {
    console.log('✅ SHADOWBAN LIFTED! Account is now normal.');
    console.log('✅ Ready for automation!');
    process.exit(0);
  } else {
    console.log('⚠️ Still restricted:', text.substring(0, 200));
    process.exit(1);
  }
  
  await tw.close();
})();
