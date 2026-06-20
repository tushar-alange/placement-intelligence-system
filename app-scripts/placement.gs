const LAMBDA_URL = "https://zasqht7wudfr3kr5pwog7gqmsi0vmisw.lambda-url.ap-south-1.on.aws/";
const LABEL_NAME = "placement-auto";

function processPlacements() {

  Logger.log("===== SCRIPT STARTED =====");

  const label = GmailApp.getUserLabelByName(LABEL_NAME);

  if (!label) {
    Logger.log("ERROR: Label not found");
    return;
  }

  const threads = label.getThreads();
  Logger.log("Label: " + LABEL_NAME);
  Logger.log("Total threads found: " + threads.length);

  const scriptProps = PropertiesService.getScriptProperties();
  let processed = JSON.parse(scriptProps.getProperty("processed") || "[]");

  let successCount = 0;
  let failCount = 0;

  threads.forEach(thread => {

    const messages = thread.getMessages();

    messages.forEach(msg => {

      const id = msg.getId();

      Logger.log("Checking message ID: " + id);

      // skip already processed
      // if (processed.includes(id)) {
      //   Logger.log("Already processed -> skipping");
      //   return;
      // }

      const subject = msg.getSubject();
      const body = msg.getPlainBody();

      Logger.log("NEW EMAIL FOUND:");
      Logger.log("Subject: " + subject);

      const payload = {
        messageId: id,
        subject: subject,
        body: body,
        timestamp: msg.getDate()
      };

      try {
        Logger.log("Sending to Lambda...");

        const response = UrlFetchApp.fetch(LAMBDA_URL, {
          method: "post",
          contentType: "application/json",
          payload: JSON.stringify(payload),
          muteHttpExceptions: true
        });

        const code = response.getResponseCode();
        Logger.log("Lambda Response (" + code + "): " + response.getContentText());

        // Only mark as processed if Lambda actually succeeded.
        // Otherwise leave it off the processed list so the next run retries it.
        if (code === 200) {
          processed.push(id);
          successCount++;
        } else {
          Logger.log("Non-200 response — will retry on next run");
          failCount++;
        }

      } catch (err) {
        Logger.log("ERROR calling Lambda: " + err);
        failCount++;
      }

    });

  });

  // keep last 500 processed IDs only (avoid quota overflow)
  processed = processed.slice(-500);

  scriptProps.setProperty("processed", JSON.stringify(processed));

  Logger.log("Succeeded: " + successCount + " | Failed (will retry): " + failCount);
  Logger.log("Processed emails saved: " + processed.length);
  Logger.log("===== SCRIPT END =====");
}
function resetProcessed() {
  PropertiesService.getScriptProperties().deleteProperty("processed");
}