import { db } from "./db";
import { users, teachers } from "@shared/schema";
import QRCode from "qrcode";

async function seedDatabase() {
  console.log("Seeding database...");
  
  try {
    // Create admin user
    const [adminUser] = await db.insert(users).values({
      username: 'admin@school.edu',
      password: 'admin123',
      role: 'admin',
      name: 'School Administrator',
      email: 'admin@school.edu'
    }).returning();

    console.log("Created admin user:", adminUser.name);

    // Create teacher users and teachers
    const teachersData = [
      {
        name: "Mrs. Johnson",
        subject: "Mathematics",
        grade: "Grade 3",
        uniqueCode: "JOHNSON3",
        email: "johnson@school.edu"
      },
      {
        name: "Mr. Smith",
        subject: "English Language Arts",
        grade: "Grade 4",
        uniqueCode: "SMITH4",
        email: "smith@school.edu"
      },
      {
        name: "Ms. Davis",
        subject: "Science",
        grade: "Grade 2",
        uniqueCode: "DAVIS2",
        email: "davis@school.edu"
      },
      {
        name: "Mrs. Wilson",
        subject: "Social Studies",
        grade: "Grade 5",
        uniqueCode: "WILSON5",
        email: "wilson@school.edu"
      }
    ];

    for (const teacherData of teachersData) {
      // Create teacher user account
      const [teacherUser] = await db.insert(users).values({
        username: teacherData.email,
        password: 'teacher123',
        role: 'teacher',
        name: teacherData.name,
        email: teacherData.email
      }).returning();

      // Generate QR code data
      const qrCodeData = JSON.stringify({
        type: 'teacher_queue',
        code: teacherData.uniqueCode,
        teacherName: teacherData.name,
        subject: teacherData.subject
      });
      
      const qrCodeUrl = await QRCode.toDataURL(qrCodeData);

      // Create teacher profile
      const [teacher] = await db.insert(teachers).values({
        userId: teacherUser.id,
        name: teacherData.name,
        subject: teacherData.subject,
        uniqueCode: teacherData.uniqueCode,
        qrCode: qrCodeUrl,
        isActive: true
      }).returning();

      console.log(`Created teacher: ${teacher.name} (${teacher.uniqueCode})`);
    }

    console.log("Database seeded successfully!");
    console.log("\nDemo credentials:");
    console.log("Admin: admin@school.edu / admin123");
    console.log("Teacher: teacher@school.edu / teacher123");
    console.log("\nTeacher codes for testing:");
    teachersData.forEach(t => console.log(`${t.name}: ${t.uniqueCode}`));

  } catch (error) {
    console.error("Error seeding database:", error);
  }
}

seedDatabase();