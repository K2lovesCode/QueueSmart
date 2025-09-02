export interface QRCodeData {
  type: 'teacher_queue';
  code: string;
  teacherName: string;
  subject: string;
}

export function generateQRCodeData(teacher: {
  uniqueCode: string;
  name: string;
  subject: string;
}): string {
  const qrData: QRCodeData = {
    type: 'teacher_queue',
    code: teacher.uniqueCode,
    teacherName: teacher.name,
    subject: teacher.subject
  };
  
  return JSON.stringify(qrData);
}

export function parseQRCodeData(qrString: string): QRCodeData | null {
  try {
    const data = JSON.parse(qrString);
    if (data.type === 'teacher_queue' && data.code) {
      return data;
    }
    return null;
  } catch {
    return null;
  }
}
