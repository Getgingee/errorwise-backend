with open('src/controllers/authController.js', 'r', encoding='utf-8') as f:
    lines = f.readlines()

with open('src/controllers/authController.js', 'w', encoding='utf-8') as f:
    f.writelines(lines[:450])

print('✅ Removed edge case functions from authController.js')
