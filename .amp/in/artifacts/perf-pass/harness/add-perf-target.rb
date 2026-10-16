# Adds a throwaway UI-test target (HowMuchPerfUITests) and a shared scheme
# (HowMuchPerf, tests built in Release) to apps/ios/HowMuch.xcodeproj, for
# benchmarking only. Never commit the result.
#
# Usage (repo root): ruby add-perf-target.rb <repo-root> <path-to-HowMuchPerfUITests.swift>
# Needs the `xcodeproj` gem (`gem install --user-install xcodeproj`).
require "fileutils"
require "xcodeproj"

root = File.expand_path(ARGV.fetch(0))
source = File.expand_path(ARGV.fetch(1))
project_path = File.join(root, "apps/ios/HowMuch.xcodeproj")
target_name = "HowMuchPerfUITests"

project = Xcodeproj::Project.open(project_path)
if project.targets.any? { |t| t.name == target_name }
  puts "#{target_name} already present; nothing to do"
  exit 0
end
app = project.targets.find { |t| t.name == "HowMuch" } or abort("no HowMuch target")

dir = File.join(root, "apps/ios", target_name)
FileUtils.mkdir_p(dir)
FileUtils.cp(source, File.join(dir, "HowMuchPerfUITests.swift"))

target = project.new_target(:ui_test_bundle, target_name, :ios, "26.0", nil, :swift)
target.add_dependency(app)
group = project.main_group.new_group(target_name, target_name)
ref = group.new_reference("HowMuchPerfUITests.swift")
target.add_file_references([ref])

target.build_configurations.each do |config|
  s = config.build_settings
  s["TEST_TARGET_NAME"] = "HowMuch"
  s["PRODUCT_BUNDLE_IDENTIFIER"] = "sg.soon.howmuch.perfuitests"
  s["PRODUCT_NAME"] = "$(TARGET_NAME)"
  s["GENERATE_INFOPLIST_FILE"] = "YES"
  s["SWIFT_VERSION"] = "5.0"
  s["IPHONEOS_DEPLOYMENT_TARGET"] = "26.0"
  s["TARGETED_DEVICE_FAMILY"] = "1,2"
  s["SUPPORTED_PLATFORMS"] = "iphoneos iphonesimulator"
  s["CODE_SIGN_STYLE"] = "Automatic"
  s["DEVELOPMENT_TEAM"] = "PQ6U5ESLN2"
  s["SWIFT_EMIT_LOC_STRINGS"] = "NO"
end

attributes = project.root_object.attributes["TargetAttributes"] ||= {}
attributes[target.uuid] = { "CreatedOnToolsVersion" => "26.0", "TestTargetID" => app.uuid }

project.save

scheme = Xcodeproj::XCScheme.new
scheme.add_build_target(app)
scheme.add_test_target(target)
scheme.set_launch_target(app)
scheme.test_action.build_configuration = "Release"
scheme.launch_action.build_configuration = "Release"
scheme.save_as(project_path, "HowMuchPerf", true)
puts "added #{target_name} and scheme HowMuchPerf (tests build Release)"
