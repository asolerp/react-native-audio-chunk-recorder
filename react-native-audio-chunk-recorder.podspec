require 'json'

package = JSON.parse(File.read(File.join(__dir__, 'package.json')))

Pod::Spec.new do |s|
  s.name         = "react-native-audio-chunk-recorder"
  s.version      = package["version"]
  s.summary      = package["description"]
  s.description  = <<-DESC
                  React Native audio recording with chunking support.
                  Provides native iOS and Android implementations for recording audio in chunks.
                   DESC
  s.homepage     = "https://github.com/docplanner/react-native-audio-chunk-recorder"
  s.license      = "MIT"
  s.authors      = { "DocPlanner" => "mobile@docplanner.com" }
  s.platforms    = { :ios => "10.0" }
  s.source       = { :git => "https://github.com/docplanner/react-native-audio-chunk-recorder.git", :tag => "#{s.version}" }

  s.source_files = "ios/**/*.{h,c,cc,cpp,m,mm,swift}"
  s.requires_arc = true

  s.dependency "React-Core"
  
  # iOS specific frameworks
  s.frameworks = 'AVFoundation'
end 