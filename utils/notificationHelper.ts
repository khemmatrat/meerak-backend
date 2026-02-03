export const sendRehireNotification = (
  providerId: string,
  providerName: string,
  employerId: string,
  employerName: string,
  jobTitle: string,
  jobId: string
) => {
  // 1. บันทึกในระบบ notification
  const notification = {
    id: `rehire_${Date.now()}`,
    type: 'JOB_REHIRE',
    title: 'คุณถูกจ้างงานซ้ำ! 🎉',
    message: `${employerName} ต้องการจ้างคุณอีกครั้งสำหรับงาน: "${jobTitle}"`,
    senderId: employerId,
    receiverId: providerId,
    jobId: jobId,
    data: {
      employerName,
      jobTitle,
      jobId,
      timestamp: new Date().toISOString()
    },
    read: false,
    createdAt: new Date().toISOString()
  };

  // 2. บันทึกใน localStorage ของ provider
  const providerNotifications = JSON.parse(
    localStorage.getItem(`user_notifications_${providerId}`) || '[]'
  );
  providerNotifications.unshift(notification); // เพิ่มที่ต้น array
  localStorage.setItem(`user_notifications_${providerId}`, JSON.stringify(providerNotifications));

  // 3. บันทึกในระบบกลาง (สำหรับแสดงในแอพ)
  const allNotifications = JSON.parse(localStorage.getItem('system_notifications') || '[]');
  allNotifications.push(notification);
  localStorage.setItem('system_notifications', JSON.stringify(allNotifications));

  // 4. บันทึกประวัติการจ้างงานซ้ำ
  const rehireLog = {
    notificationId: notification.id,
    employerId,
    providerId,
    jobId,
    sentAt: new Date().toISOString(),
    status: 'SENT'
  };
  
  const rehireLogs = JSON.parse(localStorage.getItem('rehire_logs') || '[]');
  rehireLogs.push(rehireLog);
  localStorage.setItem('rehire_logs', JSON.stringify(rehireLogs));

  return notification;
};

// ฟังก์ชันเช็คว่า provider มี notification ใหม่ไหม
export const checkProviderNotifications = (providerId: string) => {
  const notifications = JSON.parse(
    localStorage.getItem(`user_notifications_${providerId}`) || '[]'
  );
  return notifications.filter((n: any) => !n.read);
};

// ฟังก์ชันอ่าน notification
export const markNotificationAsRead = (providerId: string, notificationId: string) => {
  const notifications = JSON.parse(
    localStorage.getItem(`user_notifications_${providerId}`) || '[]'
  );
  const updatedNotifications = notifications.map((n: any) =>
    n.id === notificationId ? { ...n, read: true, readAt: new Date().toISOString() } : n
  );

  localStorage.setItem(`user_notifications_${providerId}`, JSON.stringify(updatedNotifications));
  return updatedNotifications;
};